/**
 * The app's small set of building blocks. Every control is at least 48 points
 * tall (docs/05 §6: one-handed use, large tap targets) and carries an
 * accessibility role and label; colours come from the shared tokens.
 */
import { Minus, Plus } from "lucide-react-native";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function Screen({
  children,
  scroll = true,
  footer,
}: {
  children: ReactNode;
  scroll?: boolean;
  /** Pinned under the content: the screen's one primary action. */
  footer?: ReactNode;
}) {
  return (
    <SafeAreaView className="flex-1 bg-white" edges={["bottom", "left", "right"]}>
      {scroll ? (
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-5 p-4"
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View className="flex-1 gap-5 p-4">{children}</View>
      )}
      {footer ? <View className="gap-2 border-t border-gray-100 bg-white p-4">{footer}</View> : null}
    </SafeAreaView>
  );
}

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const buttonStyles: Record<ButtonVariant, { box: string; text: string }> = {
  primary: { box: "bg-brand-yellow", text: "text-brand-ink" },
  secondary: { box: "border border-gray-300 bg-white", text: "text-brand-ink" },
  danger: { box: "bg-status-danger", text: "text-white" },
  ghost: { box: "", text: "text-status-info" },
};

export function Button({
  label,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const style = buttonStyles[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      className={`min-h-12 items-center justify-center rounded-lg px-4 ${style.box} ${
        inactive ? "opacity-50" : ""
      }`}
    >
      {loading ? (
        <ActivityIndicator />
      ) : (
        <Text className={`font-semibold text-base ${style.text}`}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Card({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "warn" }) {
  return (
    <View
      className={`gap-3 rounded-lg border p-4 ${
        tone === "warn" ? "border-status-warning bg-amber-50" : "border-gray-200 bg-white"
      }`}
    >
      {children}
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" className="font-semibold text-lg text-brand-ink">
      {children}
    </Text>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <Text className="text-sm text-gray-600">{children}</Text>;
}

export function Field({
  label,
  error,
  hint,
  testID,
  ...input
}: { label: string; error?: string | null; hint?: string; testID?: string } & TextInputProps) {
  return (
    <View className="gap-1.5">
      <Text className="font-medium text-sm text-brand-ink">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        testID={testID}
        placeholderTextColor="#9CA3AF"
        className={`min-h-12 rounded-lg border px-4 py-3 text-base text-brand-ink ${
          error ? "border-status-danger" : "border-gray-300"
        }`}
        {...input}
      />
      {error ? (
        <Text accessibilityRole="alert" className="text-sm text-status-danger">
          {error}
        </Text>
      ) : hint ? (
        <Hint>{hint}</Hint>
      ) : null}
    </View>
  );
}

/** A selectable row: one choice out of a list. */
export function Choice({
  title,
  subtitle,
  selected,
  onPress,
  disabled = false,
  testID,
}: {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      className={`min-h-14 flex-row items-center gap-3 rounded-lg border px-4 py-3 ${
        selected ? "border-brand-ink bg-yellow-50" : "border-gray-200 bg-white"
      } ${disabled ? "opacity-40" : ""}`}
    >
      <View
        className={`size-5 items-center justify-center rounded-full border-2 ${
          selected ? "border-brand-ink" : "border-gray-300"
        }`}
      >
        {selected ? <View className="size-2.5 rounded-full bg-brand-ink" /> : null}
      </View>
      <View className="flex-1">
        <Text className="font-medium text-base text-brand-ink">{title}</Text>
        {subtitle ? <Text className="text-sm text-gray-600">{subtitle}</Text> : null}
      </View>
    </Pressable>
  );
}

export function QtyStepper({
  label,
  value,
  onChange,
  max = 50,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  max?: number;
}) {
  return (
    <View className="min-h-14 flex-row items-center justify-between gap-3">
      <Text className="flex-1 text-base text-brand-ink">{label}</Text>
      <View className="flex-row items-center gap-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Fewer ${label}`}
          disabled={value === 0}
          onPress={() => onChange(value - 1)}
          hitSlop={4}
          className={`size-12 items-center justify-center rounded-full border border-gray-300 ${
            value === 0 ? "opacity-30" : ""
          }`}
        >
          <Minus size={20} color="#0B0B0C" />
        </Pressable>
        <Text
          accessibilityLabel={`${value} ${label}`}
          className="w-10 text-center font-semibold text-lg text-brand-ink"
        >
          {value}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`More ${label}`}
          disabled={value >= max}
          onPress={() => onChange(value + 1)}
          hitSlop={4}
          className={`size-12 items-center justify-center rounded-full bg-brand-yellow ${
            value >= max ? "opacity-30" : ""
          }`}
        >
          <Plus size={20} color="#0B0B0C" />
        </Pressable>
      </View>
    </View>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      className="items-center justify-center p-8"
    >
      <ActivityIndicator />
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <View className="items-center gap-2 px-8 py-12">
      <Text className="text-center font-semibold text-lg text-brand-ink">{title}</Text>
      {body ? <Text className="text-center text-sm text-gray-600">{body}</Text> : null}
    </View>
  );
}

export function ErrorState({
  message = "Something went wrong.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <View accessibilityRole="alert" className="items-center gap-4 px-8 py-12">
      <Text className="text-center text-base text-gray-700">{message}</Text>
      {onRetry ? (
        <View className="w-40">
          <Button label="Try again" variant="secondary" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

export function Banner({ tone, children }: { tone: "error" | "info" | "success"; children: ReactNode }) {
  const styles = {
    error: "border-status-danger bg-red-50",
    info: "border-status-info bg-blue-50",
    success: "border-status-success bg-green-50",
  }[tone];
  return (
    <View
      accessibilityRole={tone === "error" ? "alert" : undefined}
      className={`rounded-lg border p-3 ${styles}`}
    >
      <Text className="text-sm text-brand-ink">{children}</Text>
    </View>
  );
}

export function Row({ left, right, bold = false }: { left: string; right: string; bold?: boolean }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className={`flex-1 text-sm ${bold ? "font-semibold text-brand-ink" : "text-gray-700"}`}>
        {left}
      </Text>
      <Text className={`text-sm ${bold ? "font-semibold text-brand-ink" : "text-gray-700"}`}>
        {right}
      </Text>
    </View>
  );
}
