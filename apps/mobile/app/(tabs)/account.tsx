import { View, Text } from "react-native";
import Constants from "expo-constants";
import { Button, Card, Row, Screen } from "../../components/ui";
import { useAuth } from "../../lib/auth";

export default function AccountScreen() {
  const { user, logout } = useAuth();
  return (
    <Screen>
      <Card>
        <Text className="font-bold text-xl text-brand-ink">{user?.full_name || "Your account"}</Text>
        <Row left="Phone" right={user?.phone ?? "—"} />
      </Card>
      <Button label="Log out" variant="secondary" testID="log-out" onPress={logout} />
      <View className="items-center">
        <Text className="text-xs text-gray-500">
          IronMan {Constants.expoConfig?.version ?? ""}
        </Text>
      </View>
    </Screen>
  );
}
