// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Shim de React.cache para jest. La app corre sobre la React que bundlea
// Next 15 (que exporta `cache`), pero jest usa la de node_modules (react 18.3.1
// no lo exporta), así que `cache(fn)` a nivel módulo tiraba
// "(0 , _react.cache) is not a function" y rompía cualquier suite que importara
// permissions-agency.ts. En tests no necesitamos memoización → identidad.
{
  const React = require('react')
  if (typeof React.cache !== 'function') {
    React.cache = (fn) => fn
  }
}

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
    }
  },
  usePathname() {
    return '/'
  },
  useSearchParams() {
    return new URLSearchParams()
  },
}))

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createServerClient: jest.fn(),
  createAdminClient: jest.fn(),
}))

