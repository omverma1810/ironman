import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Banner, Button, Field } from "../components/ui";
import { ApiError, useAuth } from "../lib/auth";

export default function LoginScreen() {
  const router = useRouter();
  const { user, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Redirect href="/" />;

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await login(email, password, needsCode ? totp.trim() : undefined);
      router.replace("/");
    } catch (err) {
      if (ApiError.isApiError(err)) {
        if (err.code === "invalid_mfa_code" || err.code === "mfa_required") setNeedsCode(true);
        setError(err.message);
      } else {
        // Signing in is the one thing that needs the network.
        setError("Couldn't reach the server. Check your connection and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerClassName="flex-grow justify-center gap-6 px-6" keyboardShouldPersistTaps="handled">
        <View className="gap-1">
          <Text accessibilityRole="header" className="font-bold text-3xl text-brand-ink">
            IronMan Field
          </Text>
          <Text className="text-base text-gray-700">Sign in with your work email.</Text>
        </View>
        <Field
          label="Email"
          testID="email-input"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
        />
        <Field
          label="Password"
          testID="password-input"
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          value={password}
          onChangeText={setPassword}
        />
        {needsCode ? (
          <Field
            label="Authenticator code"
            testID="totp-input"
            keyboardType="number-pad"
            maxLength={6}
            value={totp}
            onChangeText={setTotp}
          />
        ) : null}
        {error ? <Banner tone="error">{error}</Banner> : null}
        <Button
          label="Sign in"
          testID="sign-in"
          loading={busy}
          disabled={!email.trim() || !password}
          onPress={submit}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
