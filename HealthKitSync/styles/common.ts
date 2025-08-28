// styles/common.ts
import { StyleSheet } from 'react-native';
import { colors, typography, spacing, shadows } from './index';

export const commonStyles = StyleSheet.create({
  // Layout helpers
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  
  centeredContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  
  // Cards
  card: {
    backgroundColor: colors.background.secondary,
    borderRadius: 12,
    padding: spacing.lg,
    ...shadows.md,
  },
  
  cardLarge: {
    backgroundColor: colors.background.secondary,
    borderRadius: 16,
    padding: spacing.xl,
    ...shadows.lg,
  },
  
  // Buttons
  buttonPrimary: {
    backgroundColor: colors.primary[600],
    paddingHorizontal: spacing['3xl'],
    paddingVertical: spacing.lg,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  
  buttonSecondary: {
    backgroundColor: colors.background.secondary,
    paddingHorizontal: spacing['3xl'],
    paddingVertical: spacing.lg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.gray[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  // Text styles
  textPrimary: {
    color: colors.gray[900],
    ...typography.styles.body,
  },
  
  textSecondary: {
    color: colors.gray[500],
    ...typography.styles.body,
  },
  
  textButton: {
    color: colors.background.secondary,
    ...typography.styles.button,
  },
  
  // Health widget common styles
  healthWidget: {
    backgroundColor: colors.background.secondary,
    borderRadius: 16,
    padding: spacing.lg,
    ...shadows.md,
  },
  
  healthWidgetTitle: {
    ...typography.styles.bodySmall,
    color: colors.gray[500],
    marginBottom: spacing.xs,
  },
  
  healthWidgetValue: {
    ...typography.styles.h3,
    color: colors.gray[900],
  },
  
  // Grid helpers
  widgetRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  
  widgetHalf: {
    flex: 1,
  },
  
  // Screen padding
  screenPadding: {
    paddingHorizontal: spacing.lg,
  },
  
  screenHeader: {
    paddingVertical: spacing.lg,
  },
});