import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  Text,
  TextInput,
  View,
} from "react-native";
import { ApiError, useAuth } from "../lib/auth";

export default function LoginScreen() {
  const router = useRouter();
  const { requestOtp, verifyOtp } = useAuth();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRequestOtp() {
    setError(null);
    setIsSubmitting(true);
    try {
      await requestOtp(phone.trim());
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
      await verifyOtp(phone.trim(), code.trim());
      router.replace("/");
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
          <Text className="font-bold text-3xl text-brand-ink">IronMan</Text>
          <Text className="text-base text-gray-500">
            {step === "phone"
              ? "Enter your phone number to track your laundry."
              : `Enter the code we sent to ${phone}.`}
          </Text>
        </View>

        {step === "phone" ? (
          <TextInput
            className="rounded-lg border border-gray-300 px-4 py-3 text-base"
            placeholder="+91 98765 43210"
            keyboardType="phone-pad"
            autoFocus
            value={phone}
            onChangeText={setPhone}
          />
        ) : (
          <TextInput
            className="rounded-lg border border-gray-300 px-4 py-3 text-center text-2xl tracking-widest"
            placeholder="000000"
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            value={code}
            onChangeText={setCode}
          />
        )}

        {error && <Text className="text-status-danger text-sm">{error}</Text>}

        <Pressable
          className="items-center rounded-lg bg-brand-yellow py-3 disabled:opacity-50"
          disabled={isSubmitting || (step === "phone" ? !phone.trim() : code.trim().length < 4)}
          onPress={step === "phone" ? handleRequestOtp : handleVerifyOtp}
        >
          {isSubmitting ? (
            <ActivityIndicator />
          ) : (
            <Text className="font-semibold text-base text-brand-ink">
              {step === "phone" ? "Send code" : "Verify & continue"}
            </Text>
          )}
        </Pressable>

        {step === "code" && (
          <Pressable onPress={() => setStep("phone")}>
            <Text className="text-center text-sm text-gray-500">Use a different number</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}
