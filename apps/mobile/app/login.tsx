import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Banner, Button, Field } from "../components/ui";
import { ApiError, useAuth } from "../lib/auth";
import { isPlausiblePhone, normalizePhone } from "../lib/phone";

export default function LoginScreen() {
  const router = useRouter();
  const { user, requestOtp, verifyOtp } = useAuth();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Redirect href="/" />;

  const e164 = normalizePhone(phone);

  async function handleRequestOtp() {
    setError(null);
    setIsSubmitting(true);
    try {
      await requestOtp(e164);
      setStep("code");
    } catch (err) {
      setError(ApiError.isApiError(err) ? err.message : "Couldn't send the code. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyOtp() {
    setError(null);
    setIsSubmitting(true);
    try {
      const { restored } = await verifyOtp(e164, code.trim());
      router.replace(restored ? { pathname: "/", params: { restored: "1" } } : "/");
    } catch (err) {
      setError(ApiError.isApiError(err) ? err.message : "That code didn't work. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 justify-center gap-6 px-6">
        <View className="gap-1">
          <Text accessibilityRole="header" className="font-bold text-3xl text-brand-ink">
            IronMan
          </Text>
          <Text className="text-base text-gray-600">
            {step === "phone"
              ? "Enter your phone number to book and track your laundry."
              : `Enter the code we sent to ${e164}.`}
          </Text>
        </View>

        {step === "phone" ? (
          <Field
            label="Phone number"
            testID="phone-input"
            placeholder="98765 43210"
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            autoFocus
            value={phone}
            onChangeText={setPhone}
            hint="We'll text you a code. Indian numbers don't need +91."
          />
        ) : (
          <Field
            label="Code"
            testID="code-input"
            placeholder="000000"
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            autoFocus
            value={code}
            onChangeText={setCode}
          />
        )}

        {error ? <Banner tone="error">{error}</Banner> : null}

        <Button
          label={step === "phone" ? "Send code" : "Verify & continue"}
          testID="login-submit"
          loading={isSubmitting}
          disabled={step === "phone" ? !isPlausiblePhone(phone) : code.trim().length < 4}
          onPress={step === "phone" ? handleRequestOtp : handleVerifyOtp}
        />

        {step === "code" ? (
          <Button
            label="Use a different number"
            variant="ghost"
            onPress={() => {
              setStep("phone");
              setCode("");
              setError(null);
            }}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}
