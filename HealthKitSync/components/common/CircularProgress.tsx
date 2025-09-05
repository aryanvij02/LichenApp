import React, { useEffect, useRef } from "react";
import { View, Animated, Easing } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface CircularProgressProps {
  size?: number;
  strokeWidth?: number;
  progress: number; // 0-100
  showGradient?: boolean;
  gradientColors?: string[];
  backgroundColor?: string;
  children?: React.ReactNode;
  animationDuration?: number; // Duration in milliseconds
  animationDelay?: number; // Delay before animation starts
  easing?: (value: number) => number;
}

const CircularProgressComponent: React.FC<CircularProgressProps> = ({
  size = 80,
  strokeWidth = 6,
  progress,
  showGradient = true,
  gradientColors = ["#10B981", "#F59E0B", "#EF4444"], // Green -> Yellow -> Red
  backgroundColor = "#E5E7EB",
  children,
  animationDuration = 1500,
  animationDelay = 0,
  easing = Easing.out(Easing.cubic),
}) => {
  const animatedProgress = useRef(new Animated.Value(0)).current;
  const previousProgress = useRef(0);

  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDasharray = circumference;

  // Animate progress changes
  useEffect(() => {
    const targetProgress = Math.max(0, Math.min(100, progress));

    // Only animate if there's a meaningful change
    if (Math.abs(targetProgress - previousProgress.current) > 0.1) {
      const animation = Animated.timing(animatedProgress, {
        toValue: targetProgress,
        duration: animationDuration,
        delay: animationDelay,
        easing: easing,
        useNativeDriver: false, // SVG animations don't support native driver
      });

      animation.start();
      previousProgress.current = targetProgress;
    }
  }, [progress, animationDuration, animationDelay, easing]);

  // Calculate stroke offset based on animated progress
  const strokeDashoffset = animatedProgress.interpolate({
    inputRange: [0, 100],
    outputRange: [circumference, 0],
  });

  // Calculate animated position for progress indicator dot
  const indicatorAngle = animatedProgress.interpolate({
    inputRange: [0, 100],
    outputRange: [-90, 270], // -90 degrees (top) to 270 degrees (full circle)
  });

  const indicatorX = indicatorAngle.interpolate({
    inputRange: [-90, 270],
    outputRange: [
      size / 2 + radius * Math.cos(-90 * (Math.PI / 180)),
      size / 2 + radius * Math.cos(270 * (Math.PI / 180)),
    ],
  });

  const indicatorY = indicatorAngle.interpolate({
    inputRange: [-90, 270],
    outputRange: [
      size / 2 + radius * Math.sin(-90 * (Math.PI / 180)),
      size / 2 + radius * Math.sin(270 * (Math.PI / 180)),
    ],
  });

  // Calculate current color based on animated progress
  const progressColor = animatedProgress.interpolate({
    inputRange: [0, 33, 66, 100],
    outputRange:
      showGradient && gradientColors.length >= 3
        ? gradientColors.slice(0, 3).concat([gradientColors[2]]) // Ensure 4 colors for interpolation
        : [
            gradientColors[0] || "#10B981",
            gradientColors[0] || "#10B981",
            gradientColors[0] || "#10B981",
            gradientColors[0] || "#10B981",
          ],
    extrapolate: "clamp",
  });

  // Get static color for display purposes (for progress indicator dot)
  const getStaticProgressColor = () => {
    if (!showGradient || gradientColors.length === 0) {
      return gradientColors[0] || "#10B981";
    }
    if (progress <= 33) return gradientColors[0];
    if (progress <= 66) return gradientColors[1];
    return gradientColors[2];
  };

  const staticProgressColor = getStaticProgressColor();

  return (
    <View
      style={{
        width: size,
        height: size,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Defs>
          <LinearGradient
            id="progressGradient"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <Stop offset="0%" stopColor={gradientColors[0]} />
            <Stop offset="50%" stopColor={gradientColors[1]} />
            <Stop offset="100%" stopColor={gradientColors[2]} />
          </LinearGradient>
        </Defs>

        {/* Background circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={backgroundColor}
          strokeWidth={strokeWidth}
          fill="transparent"
        />

        {/* Progress circle */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={showGradient ? "url(#progressGradient)" : progressColor}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />

        {/* Progress indicator (dash) - positioned at end of progress arc */}
        {progress > 0 && (
          <AnimatedCircle
            cx={indicatorX}
            cy={indicatorY}
            r={strokeWidth / 2 + 1}
            fill={staticProgressColor}
          />
        )}
      </Svg>

      {/* Content overlay */}
      {children && (
        <View
          style={{
            position: "absolute",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {children}
        </View>
      )}
    </View>
  );
};

export const CircularProgress = React.memo(CircularProgressComponent);

// Add display name for debugging
CircularProgress.displayName = "CircularProgress";
