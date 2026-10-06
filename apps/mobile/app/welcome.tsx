import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Banner, Button, Field } from "../components/ui";
import { ApiError, useAuth } from "../lib/auth";

/** First sign-in: staff and riders call customers by name, so ask for it once. */
export default function WelcomeScreen() {
  const router = useRouter();
  const { user, isLoading, updateName } = useAuth();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) return null;
  if (!user) return <Redirect href="/login" />;
  if (user.full_name?.trim()) return <Redirect href="/" />;

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await updateName(name);
      router.replace("/");
    } catch (err) {
      setError(ApiError.isApiError(err) ? err.message : "Couldn't save your name. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 justify-center gap-6 px-6">
        <View className="gap-1">
          <Text accessibilityRole="header" className="font-bold text-3xl text-brand-ink">
            Welcome to IronMan
          </Text>
          <Text className="text-base text-gray-600">What should we call you? Our riders will use it at your door.</Text>
        </View>
        <Field
          label="Your name"
          testID="name-input"
          autoFocus
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          value={name}
          onChangeText={setName}
        />
        {error ? <Banner tone="error">{error}</Banner> : null}
        <Button label="Continue" testID="name-continue" loading={saving} disabled={name.trim().length < 2} onPress={save} />
      </View>
    </SafeAreaView>
  );
}
