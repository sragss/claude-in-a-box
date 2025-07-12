export interface PostSpinupCommand {
  type: 'git_clone' | 'shell_command' | 'setup_github_user';
  repo?: string;
  directory?: string;
  command?: string;
  workingDirectory?: string;
  description?: string;
  // GitHub user setup
  username?: string;
  email?: string;
}

export interface DevSession {
  sessionId: string;
  network: string;
  devContainer: string;
  wettyContainer: string;
  sshKeysPath: string;
  postSpinupCommands: PostSpinupCommand[];
  startupDirectory: string;
  devPort: number | null;
  wettyPort: number | null;
  createdAt?: Date;
  lastAccessed?: Date;
  // GitHub user data
  userId: string;
  username: string;
  userEmail?: string;
}

export interface SessionStats {
  total: number;
  active: number;
  averageAge: number;
  oldestSession: number;
}

export interface CreateSessionOptions {
  postSpinupCommands?: PostSpinupCommand[];
}