// styles/colors.ts
export const colors = {
    // Primary colors
    primary: {
      50: '#EFF6FF',
      100: '#DBEAFE', 
      500: '#3B82F6',
      600: '#2563EB',
      700: '#1D4ED8',
      900: '#1E3A8A',
    },
    
    // Gray scale
    gray: {
      50: '#F9FAFB',
      100: '#F3F4F6',
      200: '#E5E7EB',
      300: '#D1D5DB',
      400: '#9CA3AF',
      500: '#6B7280',
      600: '#4B5563',
      700: '#374151',
      800: '#1F2937',
      900: '#111827',
    },
    
    // Semantic colors
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    
    // Background colors
    background: {
      primary: '#F3F4F6',
      secondary: '#FFFFFF',
      tertiary: '#F9FAFB',
    },
    
    // Health data colors
    health: {
      heartRate: '#EF4444',
      steps: '#10B981',
      sleep: '#8B5CF6',
      energy: '#F59E0B',
    },
  } as const;