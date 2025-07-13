// Better Auth handles user and session types internally
// We only need to define our application-specific types

export interface PostSpinupCommand {
  type: 'git_clone' | 'shell_command' | 'setup_github_user' | 'write_env_file';
  repo?: string;
  directory?: string;
  command?: string;
  workingDirectory?: string;
  username?: string;
  email?: string;
  envVars?: Record<string, string>;
}

export interface SessionResponse {
  success: boolean;
  sessionId: string;
  terminalUrl: string;
  devUrl: string;
  message: string;
}

export type StatusType = 'success' | 'error' | 'info';

export interface StatusMessage {
  message: string;
  type: StatusType;
}