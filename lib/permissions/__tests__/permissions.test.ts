import {
  hasPermission,
  canAccessModule,
  isOwnDataOnly,
  getAccessibleModules,
  shouldShowInSidebar,
} from '../../permissions'
import type { UserRole, Module, Permission } from '../../permissions'

describe('Permissions System', () => {
  describe('hasPermission', () => {
    it('should return true for SUPER_ADMIN with read permission on dashboard', () => {
      const result = hasPermission('SUPER_ADMIN', 'dashboard', 'read')
      expect(result).toBe(true)
    })

    it('should return true for SUPER_ADMIN with write permission on leads', () => {
      const result = hasPermission('SUPER_ADMIN', 'leads', 'write')
      expect(result).toBe(true)
    })

    it('should return false for SELLER with delete permission on operations', () => {
      const result = hasPermission('SELLER', 'operations', 'delete')
      expect(result).toBe(false)
    })

    it('should return false for VIEWER with write permission on any module', () => {
      const result = hasPermission('VIEWER', 'leads', 'write')
      expect(result).toBe(false)
    })

    it('should return false for CONTABLE with read permission on leads', () => {
      const result = hasPermission('CONTABLE', 'leads', 'read')
      expect(result).toBe(false)
    })
  })

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
  })

  describe('isOwnDataOnly', () => {
    it('should return true for SELLER on dashboard', () => {
      expect(isOwnDataOnly('SELLER', 'dashboard')).toBe(true)
    })

    it('should return true for SELLER on leads', () => {
      expect(isOwnDataOnly('SELLER', 'leads')).toBe(true)
    })

    it('should return false for SUPER_ADMIN on any module', () => {
      expect(isOwnDataOnly('SUPER_ADMIN', 'dashboard')).toBe(false)
      expect(isOwnDataOnly('SUPER_ADMIN', 'leads')).toBe(false)
    })

    it('should return false for ADMIN on any module', () => {
      expect(isOwnDataOnly('ADMIN', 'dashboard')).toBe(false)
    })

    it('should return false for CONTABLE on accounting', () => {
      expect(isOwnDataOnly('CONTABLE', 'accounting')).toBe(false)
    })
  })

  describe('getAccessibleModules', () => {
    it('should return all modules for SUPER_ADMIN', () => {
      const modules = getAccessibleModules('SUPER_ADMIN')
      expect(modules.length).toBeGreaterThan(10)
      expect(modules).toContain('dashboard')
      expect(modules).toContain('leads')
      expect(modules).toContain('settings')
    })

    it('should not include dashboard for CONTABLE', () => {
      const modules = getAccessibleModules('CONTABLE')
      expect(modules).not.toContain('dashboard')
      expect(modules).not.toContain('leads')
      expect(modules).toContain('accounting')
      expect(modules).toContain('operations')
    })

    it('should not include settings for SELLER', () => {
      const modules = getAccessibleModules('SELLER')
      expect(modules).not.toContain('settings')
      expect(modules).not.toContain('operators')
      expect(modules).toContain('dashboard')
      expect(modules).toContain('leads')
    })
  })

  describe('shouldShowInSidebar', () => {
    it('should return true for all modules for SUPER_ADMIN', () => {
      expect(shouldShowInSidebar('SUPER_ADMIN', 'dashboard')).toBe(true)
      expect(shouldShowInSidebar('SUPER_ADMIN', 'leads')).toBe(true)
      expect(shouldShowInSidebar('SUPER_ADMIN', 'settings')).toBe(true)
    })

    it('should return false for dashboard for CONTABLE', () => {
      expect(shouldShowInSidebar('CONTABLE', 'dashboard')).toBe(false)
    })

    it('should return false for leads for CONTABLE', () => {
      expect(shouldShowInSidebar('CONTABLE', 'leads')).toBe(false)
    })

    it('should return true for accounting for CONTABLE', () => {
      expect(shouldShowInSidebar('CONTABLE', 'accounting')).toBe(true)
    })

    it('should return false for settings for VIEWER', () => {
      expect(shouldShowInSidebar('VIEWER', 'settings')).toBe(false)
    })

    it('should return false for operators for SELLER', () => {
      expect(shouldShowInSidebar('SELLER', 'operators')).toBe(false)
    })
  })
})

