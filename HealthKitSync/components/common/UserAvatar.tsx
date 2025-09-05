import React from "react";
import { TouchableOpacity, Alert, View, Text, Image } from "react-native";
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
      <View className="w-10 h-10 rounded-full bg-blue-500 items-center justify-center">
        {user?.photo ? (
          <Image
            source={{ uri: user.photo }}
            className="w-10 h-10 rounded-full"
          />
        ) : (
          <Text className="text-white text-base font-semibold">
            {user?.name ? getInitials(user.name) : "U"}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};
