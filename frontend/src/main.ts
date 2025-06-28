import './style.css'

class ClaudeInABox {
  private currentSession: any = null;
  private authToken: string | null = null;
  private middlewareUrl = 'http://localhost:8080';

  constructor() {
    this.renderApp();
    this.setupEventListeners();
  }

  renderApp() {
    document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
      <div class="claude-app">
        <header class="app-header">
          <h1>Claude in a Box</h1>
          <p>AI-powered development environment</p>
        </header>
        
        <div id="auth-section" class="auth-section">
          <div class="auth-card">
            <h2>Authentication</h2>
            <p>Enter password and optionally specify a GitHub repository to clone</p>
            <div class="auth-form">
              <input type="password" id="password-input" placeholder="Enter password" />
              <input type="text" id="github-repo-input" placeholder="GitHub repo: user/repo or full URL (optional)" />
              <button id="login-btn">Login</button>
            </div>
            <div id="auth-status" class="status-message"></div>
          </div>
        </div>

        <div id="session-section" class="session-section hidden">
          <div class="session-controls">
            <h2>Development Environment</h2>
            <div class="controls-row">
              <button id="create-session-btn" class="primary-btn">Create New Environment</button>
              <button id="cleanup-session-btn" class="secondary-btn hidden">Cleanup Environment</button>
            </div>
            <div id="session-status" class="status-message"></div>
          </div>

          <div id="terminal-section" class="terminal-section hidden">
            <div class="terminal-header">
              <h3>Terminal Access</h3>
              <span id="session-info" class="session-info"></span>
            </div>
            <div class="terminal-wrapper">
              <iframe id="terminal-iframe" class="terminal-iframe"></iframe>
            </div>
            <div class="terminal-footer">
              <a id="external-link" href="#" target="_blank" class="external-link hidden">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                  <polyline points="15,3 21,3 21,9"></polyline>
                  <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
                Open in new window
              </a>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  setupEventListeners() {
    // Login
    document.getElementById('login-btn')?.addEventListener('click', () => this.handleLogin());
    document.getElementById('password-input')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleLogin();
    });
    document.getElementById('github-repo-input')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleLogin();
    });

    // Session management
    document.getElementById('create-session-btn')?.addEventListener('click', () => this.createSession());
    document.getElementById('cleanup-session-btn')?.addEventListener('click', () => this.cleanupSession());
  }

  async handleLogin() {
    const passwordInput = document.getElementById('password-input') as HTMLInputElement;
    const loginBtn = document.getElementById('login-btn') as HTMLButtonElement;
    const statusDiv = document.getElementById('auth-status') as HTMLDivElement;

    const password = passwordInput.value.trim();
    if (!password) {
      this.showStatus('auth-status', 'Please enter a password', 'error');
      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';
    
    try {
      const response = await fetch(`${this.middlewareUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        this.authToken = result.token;
        this.showStatus('auth-status', 'Authentication successful!', 'success');
        
        // Show session section
        document.getElementById('auth-section')?.classList.add('hidden');
        document.getElementById('session-section')?.classList.remove('hidden');
      } else {
        this.showStatus('auth-status', result.error || 'Authentication failed', 'error');
      }
    } catch (error) {
      this.showStatus('auth-status', 'Failed to connect to middleware server', 'error');
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Login';
    }
  }

  async createSession() {
    if (!this.authToken) {
      this.showStatus('session-status', 'Not authenticated', 'error');
      return;
    }

    const createBtn = document.getElementById('create-session-btn') as HTMLButtonElement;
    createBtn.disabled = true;
    createBtn.textContent = 'Creating Environment...';
    
    try {
      // Collect GitHub repo URL if provided
      const githubRepoInput = document.getElementById('github-repo-input') as HTMLInputElement;
      const githubRepo = githubRepoInput?.value?.trim();
      
      const statusMessage = githubRepo 
        ? `Creating development environment and cloning ${githubRepo.split('/').pop()?.replace('.git', '')}...`
        : 'Creating development environment...';
      this.showStatus('session-status', statusMessage, 'info');
      
      // Build post-spinup commands
      const postSpinupCommands = [];
      if (githubRepo) {
        // Validate and normalize GitHub repo URL
        let repoUrl = githubRepo;
        let repoName = '';
        
        if (githubRepo.startsWith('https://github.com/')) {
          // Full URL provided
          repoUrl = githubRepo;
          repoName = githubRepo.split('/').pop()?.replace('.git', '') || 'repo';
        } else if (githubRepo.includes('/') && !githubRepo.includes('://')) {
          // user/repo format
          repoUrl = `https://github.com/${githubRepo}`;
          repoName = githubRepo.split('/').pop()?.replace('.git', '') || 'repo';
        } else {
          this.showStatus('session-status', 'Invalid GitHub repo format. Use: user/repo or full URL', 'error');
          return;
        }
        
        postSpinupCommands.push({
          type: 'git_clone',
          repo: repoUrl,
          directory: `/home/node/${repoName}`
        });
      }

      const response = await fetch(`${this.middlewareUrl}/api/session/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          token: this.authToken,
          postSpinupCommands
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        this.currentSession = result;
        this.showStatus('session-status', 'Environment created successfully!', 'success');
        
        // Show terminal
        this.loadTerminal(result);
        
        // Show cleanup button
        document.getElementById('cleanup-session-btn')?.classList.remove('hidden');
        createBtn.classList.add('hidden');
      } else {
        this.showStatus('session-status', result.error || 'Failed to create environment', 'error');
      }
    } catch (error) {
      this.showStatus('session-status', 'Failed to connect to middleware server', 'error');
    } finally {
      createBtn.disabled = false;
      createBtn.textContent = 'Create New Environment';
    }
  }

  async cleanupSession() {
    if (!this.currentSession) return;

    const cleanupBtn = document.getElementById('cleanup-session-btn') as HTMLButtonElement;
    cleanupBtn.disabled = true;
    cleanupBtn.textContent = 'Cleaning up...';

    try {
      const response = await fetch(`${this.middlewareUrl}/api/session/${this.currentSession.sessionId}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (response.ok && result.success) {
        this.showStatus('session-status', 'Environment cleaned up successfully', 'success');
        this.currentSession = null;
        
        // Hide terminal and cleanup button
        document.getElementById('terminal-section')?.classList.add('hidden');
        document.getElementById('cleanup-session-btn')?.classList.add('hidden');
        document.getElementById('create-session-btn')?.classList.remove('hidden');
      } else {
        this.showStatus('session-status', result.error || 'Failed to cleanup environment', 'error');
      }
    } catch (error) {
      this.showStatus('session-status', 'Failed to connect to middleware server', 'error');
    } finally {
      cleanupBtn.disabled = false;
      cleanupBtn.textContent = 'Cleanup Environment';
    }
  }

  loadTerminal(session: any) {
    const terminalSection = document.getElementById('terminal-section');
    const terminalIframe = document.getElementById('terminal-iframe') as HTMLIFrameElement;
    const sessionInfo = document.getElementById('session-info');
    const externalLink = document.getElementById('external-link') as HTMLAnchorElement;

    // Update session info
    if (sessionInfo) {
      sessionInfo.textContent = `Session: ${session.sessionId.substring(0, 8)}... | Port: ${session.wettyPort}`;
    }

    // Use direct Wetty URL for now
    const terminalUrl = `http://localhost:${session.wettyPort}/wetty`;
    terminalIframe.src = terminalUrl;

    // Update external link
    externalLink.href = terminalUrl;
    externalLink.classList.remove('hidden');

    // Show terminal section
    terminalSection?.classList.remove('hidden');
  }

  showStatus(elementId: string, message: string, type: 'success' | 'error' | 'info') {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = message;
      element.className = `status-message ${type}`;
    }
  }
}

// Initialize the app
new ClaudeInABox();
