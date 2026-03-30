import {
  hasPermission,
  canAccessModule,
  isOwnDataOnly,
  getAccessibleModules,
  shouldShowInSidebar,
  usePermissions,
} from '../../permissions'
import type { UserRole, Module, Permission } from '../../permissions'

describe('Permissions System', () => {
  // ─── hasPermission ──────────────────────────────────────────────────
  describe('hasPermission', () => {
    describe('SUPER_ADMIN', () => {
      it('should have all permissions on all modules', () => {
        const modules: Module[] = [
          'dashboard', 'leads', 'operations', 'customers', 'operators',
          'cash', 'accounting', 'alerts', 'reports', 'commissions', 'settings', 'documents', 'tasks',
        ]
        const permissions: Permission[] = ['read', 'write', 'delete', 'export']

        for (const module of modules) {
          for (const perm of permissions) {
            expect(hasPermission('SUPER_ADMIN', module, perm)).toBe(true)
          }
        }
      })
    })

    describe('ADMIN', () => {
      it('should have read and write on leads', () => {
        expect(hasPermission('ADMIN', 'leads', 'read')).toBe(true)
        expect(hasPermission('ADMIN', 'leads', 'write')).toBe(true)
      })

      it('should NOT have delete on most modules', () => {
        expect(hasPermission('ADMIN', 'leads', 'delete')).toBe(false)
        expect(hasPermission('ADMIN', 'operations', 'delete')).toBe(false)
        expect(hasPermission('ADMIN', 'customers', 'delete')).toBe(false)
      })

      it('should have delete on alerts', () => {
        expect(hasPermission('ADMIN', 'alerts', 'delete')).toBe(true)
      })

      it('should have read but NOT write on settings', () => {
        expect(hasPermission('ADMIN', 'settings', 'read')).toBe(true)
        expect(hasPermission('ADMIN', 'settings', 'write')).toBe(false)
      })
    })

    describe('CONTABLE', () => {
      it('should NOT have read on leads', () => {
        expect(hasPermission('CONTABLE', 'leads', 'read')).toBe(false)
      })

      it('should NOT have read on dashboard', () => {
        expect(hasPermission('CONTABLE', 'dashboard', 'read')).toBe(false)
      })

      it('should NOT have read on customers', () => {
        expect(hasPermission('CONTABLE', 'customers', 'read')).toBe(false)
      })

      it('should have read and write on accounting', () => {
        expect(hasPermission('CONTABLE', 'accounting', 'read')).toBe(true)
        expect(hasPermission('CONTABLE', 'accounting', 'write')).toBe(true)
      })

      it('should have read and write on cash', () => {
        expect(hasPermission('CONTABLE', 'cash', 'read')).toBe(true)
        expect(hasPermission('CONTABLE', 'cash', 'write')).toBe(true)
      })

      it('should have read-only on operations', () => {
        expect(hasPermission('CONTABLE', 'operations', 'read')).toBe(true)
        expect(hasPermission('CONTABLE', 'operations', 'write')).toBe(false)
      })

      it('should have read-only on commissions', () => {
        expect(hasPermission('CONTABLE', 'commissions', 'read')).toBe(true)
        expect(hasPermission('CONTABLE', 'commissions', 'write')).toBe(false)
      })
    })

    describe('SELLER', () => {
      it('should have read and write on leads (own data only)', () => {
        expect(hasPermission('SELLER', 'leads', 'read')).toBe(true)
        expect(hasPermission('SELLER', 'leads', 'write')).toBe(true)
        expect(hasPermission('SELLER', 'leads', 'delete')).toBe(false)
      })

      it('should NOT have any access to operators, cash, accounting', () => {
        expect(hasPermission('SELLER', 'operators', 'read')).toBe(false)
        expect(hasPermission('SELLER', 'cash', 'read')).toBe(false)
        expect(hasPermission('SELLER', 'accounting', 'read')).toBe(false)
      })

      it('should NOT have access to settings', () => {
        expect(hasPermission('SELLER', 'settings', 'read')).toBe(false)
      })

      it('should have read on commissions (own data only)', () => {
        expect(hasPermission('SELLER', 'commissions', 'read')).toBe(true)
        expect(hasPermission('SELLER', 'commissions', 'write')).toBe(false)
      })

      it('should be able to export own reports and commissions', () => {
        expect(hasPermission('SELLER', 'reports', 'export')).toBe(true)
        expect(hasPermission('SELLER', 'commissions', 'export')).toBe(true)
      })
    })

    describe('VIEWER', () => {
      it('should have read on all modules except settings', () => {
        const readableModules: Module[] = [
          'dashboard', 'leads', 'operations', 'customers', 'operators',
          'cash', 'accounting', 'alerts', 'reports', 'commissions', 'documents', 'tasks',
        ]
        for (const module of readableModules) {
          expect(hasPermission('VIEWER', module, 'read')).toBe(true)
        }
      })

      it('should NOT have read on settings', () => {
        expect(hasPermission('VIEWER', 'settings', 'read')).toBe(false)
      })

      it('should NOT have write on any module', () => {
        const modules: Module[] = [
          'dashboard', 'leads', 'operations', 'customers', 'operators',
          'cash', 'accounting', 'alerts', 'reports', 'commissions', 'settings', 'documents', 'tasks',
        ]
        for (const module of modules) {
          expect(hasPermission('VIEWER', module, 'write')).toBe(false)
        }
      })

      it('should be able to export reports only', () => {
        expect(hasPermission('VIEWER', 'reports', 'export')).toBe(true)
        expect(hasPermission('VIEWER', 'leads', 'export')).toBe(false)
      })
    })

    describe('invalid role/module', () => {
      it('should return false for unknown role', () => {
        expect(hasPermission('UNKNOWN' as UserRole, 'leads', 'read')).toBe(false)
      })

      it('should return false for unknown module', () => {
        expect(hasPermission('SUPER_ADMIN', 'nonexistent' as Module, 'read')).toBe(false)
      })
    })
  })

  // ─── canAccessModule ────────────────────────────────────────────────
  describe('canAccessModule', () => {
    it('should return true for SUPER_ADMIN accessing any module', () => {
      expect(canAccessModule('SUPER_ADMIN', 'dashboard')).toBe(true)
      expect(canAccessModule('SUPER_ADMIN', 'leads')).toBe(true)
      expect(canAccessModule('SUPER_ADMIN', 'settings')).toBe(true)
    })

    it('should return false for CONTABLE accessing dashboard', () => {
      expect(canAccessModule('CONTABLE', 'dashboard')).toBe(false)
    })

    it('should return false for CONTABLE accessing leads', () => {
      expect(canAccessModule('CONTABLE', 'leads')).toBe(false)
    })

    it('should return true for CONTABLE accessing accounting', () => {
      expect(canAccessModule('CONTABLE', 'accounting')).toBe(true)
    })

    it('should return true for SELLER accessing dashboard', () => {
      expect(canAccessModule('SELLER', 'dashboard')).toBe(true)
    })

    it('should return false for SELLER accessing settings', () => {
      expect(canAccessModule('SELLER', 'settings')).toBe(false)
    })

    it('should return false for SELLER accessing cash', () => {
      expect(canAccessModule('SELLER', 'cash')).toBe(false)
    })

    it('should return false for VIEWER accessing settings', () => {
      expect(canAccessModule('VIEWER', 'settings')).toBe(false)
    })
  })

  // ─── isOwnDataOnly ─────────────────────────────────────────────────
  describe('isOwnDataOnly', () => {
    it('should return true for SELLER on dashboard, leads, operations, customers', () => {
      expect(isOwnDataOnly('SELLER', 'dashboard')).toBe(true)
      expect(isOwnDataOnly('SELLER', 'leads')).toBe(true)
      expect(isOwnDataOnly('SELLER', 'operations')).toBe(true)
      expect(isOwnDataOnly('SELLER', 'customers')).toBe(true)
    })

    it('should return true for SELLER on alerts and commissions', () => {
      expect(isOwnDataOnly('SELLER', 'alerts')).toBe(true)
      expect(isOwnDataOnly('SELLER', 'commissions')).toBe(true)
    })

    it('should return false for SUPER_ADMIN on any module', () => {
      expect(isOwnDataOnly('SUPER_ADMIN', 'dashboard')).toBe(false)
      expect(isOwnDataOnly('SUPER_ADMIN', 'leads')).toBe(false)
    })

    it('should return false for ADMIN on any module', () => {
      expect(isOwnDataOnly('ADMIN', 'dashboard')).toBe(false)
      expect(isOwnDataOnly('ADMIN', 'operations')).toBe(false)
    })

    it('should return false for CONTABLE on accounting', () => {
      expect(isOwnDataOnly('CONTABLE', 'accounting')).toBe(false)
    })

    it('should return false for VIEWER on any module', () => {
      expect(isOwnDataOnly('VIEWER', 'dashboard')).toBe(false)
      expect(isOwnDataOnly('VIEWER', 'leads')).toBe(false)
    })
  })

  // ─── getAccessibleModules ───────────────────────────────────────────
  describe('getAccessibleModules', () => {
    it('should return all 13 modules for SUPER_ADMIN', () => {
      const modules = getAccessibleModules('SUPER_ADMIN')
      expect(modules.length).toBe(13)
      expect(modules).toContain('dashboard')
      expect(modules).toContain('settings')
    })

    it('should return all modules except settings for ADMIN', () => {
      const modules = getAccessibleModules('ADMIN')
      expect(modules).toContain('dashboard')
      expect(modules).toContain('leads')
      expect(modules).toContain('settings') // ADMIN has read on settings
    })

    it('should not include dashboard, leads, customers, settings, documents for CONTABLE', () => {
      const modules = getAccessibleModules('CONTABLE')
      expect(modules).not.toContain('dashboard')
      expect(modules).not.toContain('leads')
      expect(modules).not.toContain('customers')
      expect(modules).not.toContain('settings')
      expect(modules).not.toContain('documents')
      expect(modules).toContain('accounting')
      expect(modules).toContain('cash')
      expect(modules).toContain('operations')
    })

    it('should not include operators, cash, accounting, settings for SELLER', () => {
      const modules = getAccessibleModules('SELLER')
      expect(modules).not.toContain('operators')
      expect(modules).not.toContain('cash')
      expect(modules).not.toContain('accounting')
      expect(modules).not.toContain('settings')
      expect(modules).toContain('dashboard')
      expect(modules).toContain('leads')
    })

    it('should return all modules except settings for VIEWER', () => {
      const modules = getAccessibleModules('VIEWER')
      expect(modules).not.toContain('settings')
      expect(modules).toContain('dashboard')
      expect(modules).toContain('leads')
      expect(modules).toContain('accounting')
    })
  })

  // ─── shouldShowInSidebar ────────────────────────────────────────────
  describe('shouldShowInSidebar', () => {
    it('should return true for all modules for SUPER_ADMIN', () => {
      const allModules: Module[] = [
        'dashboard', 'leads', 'operations', 'customers', 'operators',
        'cash', 'accounting', 'alerts', 'reports', 'commissions', 'settings', 'documents', 'tasks',
      ]
      for (const module of allModules) {
        expect(shouldShowInSidebar('SUPER_ADMIN', module)).toBe(true)
      }
    })

    it('should return true for all modules for ADMIN', () => {
      expect(shouldShowInSidebar('ADMIN', 'dashboard')).toBe(true)
      expect(shouldShowInSidebar('ADMIN', 'settings')).toBe(true)
    })

    describe('CONTABLE sidebar', () => {
      it('should show operations, operators, cash, accounting, alerts, reports, commissions, tasks', () => {
        const visible: Module[] = ['operations', 'operators', 'cash', 'accounting', 'alerts', 'reports', 'commissions', 'tasks']
        for (const module of visible) {
          expect(shouldShowInSidebar('CONTABLE', module)).toBe(true)
        }
      })

      it('should hide dashboard, leads, customers, settings, documents', () => {
        const hidden: Module[] = ['dashboard', 'leads', 'customers', 'settings', 'documents']
        for (const module of hidden) {
          expect(shouldShowInSidebar('CONTABLE', module)).toBe(false)
        }
      })
    })

    describe('SELLER sidebar', () => {
      it('should show dashboard, leads, operations, customers, alerts, reports, commissions, documents, tasks', () => {
        const visible: Module[] = ['dashboard', 'leads', 'operations', 'customers', 'alerts', 'reports', 'commissions', 'documents', 'tasks']
        for (const module of visible) {
          expect(shouldShowInSidebar('SELLER', module)).toBe(true)
        }
      })

      it('should hide operators, cash, accounting, settings', () => {
        const hidden: Module[] = ['operators', 'cash', 'accounting', 'settings']
        for (const module of hidden) {
          expect(shouldShowInSidebar('SELLER', module)).toBe(false)
        }
      })
    })

    describe('VIEWER sidebar', () => {
      it('should show all modules except settings', () => {
        expect(shouldShowInSidebar('VIEWER', 'settings')).toBe(false)
        expect(shouldShowInSidebar('VIEWER', 'dashboard')).toBe(true)
        expect(shouldShowInSidebar('VIEWER', 'leads')).toBe(true)
        expect(shouldShowInSidebar('VIEWER', 'accounting')).toBe(true)
      })
    })
  })

  // ─── usePermissions ────────────────────────────────────────────────
  describe('usePermissions', () => {
    it('should return permission helper functions', () => {
      const perms = usePermissions('SELLER')

      expect(perms.canRead('leads')).toBe(true)
      expect(perms.canWrite('leads')).toBe(true)
      expect(perms.canDelete('leads')).toBe(false)
      expect(perms.canExport('leads')).toBe(false)
      expect(perms.ownDataOnly('leads')).toBe(true)
      expect(perms.canAccess('leads')).toBe(true)
    })

    it('should deny CONTABLE from accessing leads via helper', () => {
      const perms = usePermissions('CONTABLE')

      expect(perms.canRead('leads')).toBe(false)
      expect(perms.canAccess('leads')).toBe(false)
    })

    it('should allow SUPER_ADMIN everything via helper', () => {
      const perms = usePermissions('SUPER_ADMIN')

      expect(perms.canRead('settings')).toBe(true)
      expect(perms.canWrite('settings')).toBe(true)
      expect(perms.canDelete('settings')).toBe(true)
      expect(perms.ownDataOnly('settings')).toBe(false)
    })
  })
})
