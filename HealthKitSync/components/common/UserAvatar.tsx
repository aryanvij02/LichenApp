import React from "react";
import {
  TouchableOpacity,
  Alert,
  View,
  Text,
  Image,
  StyleSheet,
} from "react-native";
import { useAuth } from "../../context/AuthContext";
import { useNavigation } from "@react-navigation/native";

export const UserAvatar: React.FC = () => {
  const { user, signOut } = useAuth();
  const navigation = useNavigation();

  const handlePress = () => {
    Alert.alert(user?.name || "User", "Choose an option", [
      {
        text: "Settings",
        onPress: () => {
          (navigation as any).navigate("Settings");
        },
      },
      {
        text: "Developer Tools",
        onPress: () => {
          (navigation as any).navigate("Developer");
        },
      },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: signOut,
      },
      {
        text: "Cancel",
        style: "cancel",
      },
    ]);
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((word) => word.charAt(0))
      .join("")
      .substring(0, 2)
      .toUpperCase();
  };

  return (
    <TouchableOpacity onPress={handlePress}>
      <View style={styles.container}>
        {user?.photo ? (
          <Image source={{ uri: user.photo }} style={styles.avatar} />
        ) : (
          <Text style={styles.initials}>
            {user?.name ? getInitials(user.name) : "U"}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 40, // w-10
    height: 40, // h-10
    borderRadius: 20, // rounded-full
    backgroundColor: "#3b82f6", // bg-blue-500
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 40, // w-10
    height: 40, // h-10
    borderRadius: 20, // rounded-full
  },
  initials: {
    color: "white",
    fontSize: 16, // text-base
    fontWeight: "600", // font-semibold
  },
});
