declare global {
  namespace App {
    interface Platform {
      env?: {
        DB?: unknown;
      };
    }
  }

  type StaffWorkspace = 'org' | 'training' | 'design' | 'field';
  interface WorkspaceAccount {
    id: string;
    role: 'admin' | 'coach' | 'player';
    directorScopes?: unknown[];
    coachedTeamIds?: string[];
    teamId?: string | null;
    mustChangePassword?: boolean;
  }

  interface Window {
    __DIQ_READY__?: Promise<void>;
    __DIQ_AUTH_USER__?: WorkspaceAccount | null;
    _diqNavigateWorkspace?: (workspace: StaffWorkspace) => void;
    _diqWorkspaceClosed?: (workspace: StaffWorkspace) => void;
    _diqStaffSessionChanged?: (account?: WorkspaceAccount | null) => void;
    _diqOpenTrainingFromHeader?: (isCurrent?: () => boolean) => Promise<void>;
    _diqSetEditorMode?: (role: null) => void;
    _diqSetAdminMode?: (on: boolean) => void;
    _diqUpdateWorkspaceNavigation?: () => void;
    _diqCloseAccountMenu?: () => void;
    _diqCloseAccountSecurity?: () => void;
    _diqStaffTeamId?: () => string;
    _diqOpenPlaybookBrowser?: (teamId?: string) => Promise<void>;
    _diqPlayTestSituation?: (snapshot: import('$lib/domain/models').Situation) => () => void;
    _diqClosePlaybookBrowser?: () => void;
    _diqOpenAuthModal?: (role: 'player') => void;
    _diqRestoreAuthoringDraft?: () => void;
  }
}

export {};
