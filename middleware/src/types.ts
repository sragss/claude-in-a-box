export interface PostSpinupCommand {
  type: 'git_clone' | 'shell_command';
  repo?: string;
  directory?: string;
  command?: string;
  workingDirectory?: string;
  description?: string;
}

export interface Session {
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