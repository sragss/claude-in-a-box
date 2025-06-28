# Production DevOps Architecture

## Overview

Claude in a Box Mark 2 is designed for a distributed production architecture separating the web tier from compute resources for optimal scaling and cost efficiency.

## Proposed Production Architecture

```
┌─────────────────┐    HTTPS    ┌─────────────────────┐    AWS API    ┌─────────────────┐
│    Railway      │ ──────────▶ │      Railway        │ ──────────▶  │       AWS       │
│   Frontend      │             │   Middleware +      │              │  Dev Containers │
│   (Static)      │             │   WebSocket Proxy   │              │   (ECS/Fargate) │
│   Multi-Replica │             │   Multi-Replica     │              │   On-Demand     │
└─────────────────┘             └─────────────────────┘              └─────────────────┘
```

## Architecture Benefits

### Cost Optimization
- **Web Tier**: Railway handles static frontend + lightweight middleware
- **Compute Tier**: AWS Fargate charges only for active dev sessions
- **Auto-scaling**: Containers spin up/down based on demand
- **Regional Distribution**: Deploy compute closer to users

### Performance & Reliability
- **Edge Distribution**: Railway's global CDN for frontend
- **Horizontal Scaling**: Multiple middleware replicas handle load
- **Isolated Environments**: Each dev session in separate AWS task
- **Fault Tolerance**: Container failures don't affect other sessions

## Technical Implementation

### Current Local Architecture
```javascript
// Middleware spawns local Docker containers
const session = await containerOrchestrator.createSession(sessionId);
// Creates: docker run -d --name claude-dev-${sessionId}
```

### Production Architecture Changes Required

#### 1. Container Orchestrator Refactor
```javascript
// Replace Docker SDK with AWS SDK
import { ECSClient, RunTaskCommand } from "@aws-sdk/client-ecs";

class AWSContainerOrchestrator {
  async createSession(sessionId) {
    // Launch Fargate task
    const taskArn = await this.ecs.send(new RunTaskCommand({
      cluster: process.env.ECS_CLUSTER_NAME,
      taskDefinition: 'claude-dev-container',
      launchType: 'FARGATE',
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: [process.env.SUBNET_ID],
          securityGroups: [process.env.SECURITY_GROUP_ID],
          assignPublicIp: 'ENABLED'
        }
      },
      tags: [{ key: 'SessionId', value: sessionId }]
    }));

    // Wait for task to reach RUNNING state
    const taskIp = await this.getTaskPublicIp(taskArn);
    
    return {
      sessionId,
      taskArn,
      devHost: taskIp,
      devPort: 22,
      wettyHost: taskIp,
      wettyPort: 3001
    };
  }
}
```

#### 2. WebSocket Proxy Implementation

**Current Issue**: Frontend connects directly to container ports
```javascript
// PROBLEMATIC: Direct connection to container
const terminalUrl = `http://localhost:${session.wettyPort}/wetty`;
terminalIframe.src = terminalUrl;
```

**Production Requirements**: All terminal traffic must flow through middleware
```javascript
// NEW: WebSocket proxy through middleware
app.use('/terminal/:sessionId', (req, res, next) => {
  const { sessionId } = req.params;
  const session = sessionManager.getSession(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  // Authenticate terminal access
  if (!req.headers.authorization) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  next();
}, createProxyMiddleware({
  target: `https://${session.wettyHost}:${session.wettyPort}`,
  ws: true, // Enable WebSocket proxying
  secure: true,
  changeOrigin: true,
  onProxyReqWs: (proxyReq, req, socket) => {
    console.log(`WebSocket connection: ${req.url}`);
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Terminal connection failed' });
  }
}));
```

**Frontend Changes Required**:
```javascript
// OLD: Direct container connection
const terminalUrl = `http://localhost:${session.wettyPort}/wetty`;

// NEW: Proxy through middleware
const terminalUrl = `${this.middlewareUrl}/terminal/${session.sessionId}`;
terminalIframe.src = terminalUrl;
```

**Benefits of WebSocket Proxy**:
- **Security**: Authentication on every terminal connection
- **Monitoring**: Log all terminal access attempts
- **Load Balancing**: Works with Railway's load balancer
- **Network Isolation**: Container ports never exposed publicly
- **Error Handling**: Graceful fallback when containers fail

#### 3. Environment Configuration
```bash
# Railway Environment Variables
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
AWS_REGION=us-east-1
ECS_CLUSTER_NAME=claude-dev-cluster
SUBNET_ID=subnet-xxx
SECURITY_GROUP_ID=sg-xxx
TASK_DEFINITION_ARN=arn:aws:ecs:region:account:task-definition/claude-dev-container

# Railway scaling
RAILWAY_REPLICA_COUNT=3
```

## Infrastructure Requirements

### AWS Setup
```yaml
# ECS Cluster for dev containers
ECS_CLUSTER: claude-dev-cluster
TASK_DEFINITION: claude-dev-container
LAUNCH_TYPE: FARGATE
CPU: 1024 # 1 vCPU
MEMORY: 2048 # 2GB RAM

# Networking
VPC: Custom VPC with public subnets
SECURITY_GROUPS: 
  - SSH (22): From Railway IP ranges
  - Wetty (3001): From Railway IP ranges
  - Outbound: All traffic

# Container Images
ECR_REPOSITORY: claude-dev-containers
IMAGE_TAG: latest
```

### Railway Setup
```yaml
# Web Services
FRONTEND_SERVICE:
  build: ./test-frontend
  deploy: static
  replicas: 3

MIDDLEWARE_SERVICE:
  build: ./middleware  
  port: 8080
  replicas: 2-5 # Auto-scale based on load
  environment:
    - AWS_* credentials
    - ECS_* configuration
```

## Deployment Pipeline

### 1. Container Images
```bash
# Build and push dev container images to ECR
docker build -t claude-dev-image ./dev-container
docker tag claude-dev-image:latest $ECR_URI/claude-dev-image:latest
docker push $ECR_URI/claude-dev-image:latest

# Update ECS task definition
aws ecs register-task-definition --cli-input-json file://task-definition.json
```

### 2. Application Deployment
```bash
# Railway deployment
railway up # Deploys frontend + middleware automatically

# Verify deployment
curl https://claude-middleware.railway.app/health
```

## Security Considerations

### Network Security
- **VPC Isolation**: Dev containers in private subnets
- **Security Groups**: Restrict access to Railway IP ranges only
- **SSH Keys**: Dynamically generated per session
- **Session Timeout**: Automatic cleanup after inactivity

### Authentication
- **Replace test password** with OAuth/JWT integration
- **Railway → AWS**: IAM roles with minimal ECS permissions
- **Client → Railway**: Proper session management

## Monitoring & Observability

### Metrics to Track
- **Session Creation Time**: ECS task launch latency
- **Active Sessions**: Number of running containers
- **Resource Usage**: CPU/Memory per container
- **Failure Rates**: Task launch failures
- **Costs**: AWS Fargate charges per session

### Logging Strategy
```javascript
// Structured logging for production
logger.info('session_created', {
  sessionId,
  userId,
  taskArn,
  region: process.env.AWS_REGION,
  timestamp: new Date().toISOString()
});
```

## Cost Estimation

### Development Workload
- **100 concurrent sessions**: ~$50/day in Fargate costs
- **Railway hosting**: ~$20/month for web tier
- **Total**: ~$1,500/month for moderate usage

### Scaling Characteristics
- **Linear cost scaling**: Each session costs ~$0.50/hour
- **No idle costs**: Containers only run when active
- **Predictable billing**: Easy to charge users per session time

## Next Steps

1. **Phase 1**: Implement AWS ECS orchestrator
2. **Phase 2**: Deploy to Railway staging environment
3. **Phase 3**: Add monitoring and cost tracking
4. **Phase 4**: Implement proper authentication
5. **Phase 5**: Production deployment and testing

## Migration Strategy

### Current → Production
1. **Dual Mode**: Support both local Docker and AWS ECS
2. **Feature Flag**: Toggle between orchestrators
3. **Gradual Rollout**: Test with subset of users
4. **Monitoring**: Compare performance metrics
5. **Full Migration**: Switch all traffic to AWS backend

This architecture provides infinite horizontal scaling while maintaining cost efficiency through on-demand compute resources.