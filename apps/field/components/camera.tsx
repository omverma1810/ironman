/**
 * The camera, in two jobs: reading bag tags and photographing the handover.
 * Native only: the web build (used for development and the tests) has no
 * barcode support, so there the rider types the code instead, which is also
 * the fallback for a tag too scuffed to scan.
 */
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef, useState } from "react";
import { Modal, Platform, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { parseBagCode } from "../lib/bags";
import { Banner, Button } from "./ui";

const CAMERA_AVAILABLE = Platform.OS !== "web";

function Permission({ onClose }: { onClose: () => void }) {
  const [permission, request] = useCameraPermissions();
  if (permission?.granted) return null;
  return (
    <View className="flex-1 justify-center gap-4 bg-white p-6">
      <Text className="text-center text-lg text-brand-ink">
        The camera is needed to scan bags and take photos.
      </Text>
      {permission?.canAskAgain === false ? (
        <Banner tone="info">Turn the camera on for this app in the phone&apos;s Settings.</Banner>
      ) : (
        <Button label="Allow the camera" onPress={() => void request()} />
      )}
      <Button label="Not now" variant="secondary" onPress={onClose} />
    </View>
  );
}

export function BagScanner({
  visible,
  scanned,
  expected,
  onCode,
  onClose,
}: {
  visible: boolean;
  scanned: string[];
  expected: number;
  onCode: (code: string) => void;
  onClose: () => void;
}) {
  const [permission] = useCameraPermissions();
  const [message, setMessage] = useState<string | null>(null);
  const last = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  function handle(raw: string) {
    // The camera reports the same tag many times a second.
    const now = Date.now();
    if (raw === last.current.code && now - last.current.at < 2000) return;
    last.current = { code: raw, at: now };
    const code = parseBagCode(raw);
    if (!code) {
      setMessage("That isn't an IronMan bag tag.");
    } else if (scanned.includes(code)) {
      setMessage(`${code} is already scanned.`);
    } else {
      setMessage(`Scanned ${code}`);
      onCode(code);
    }
  }

  return (
    <Modal visible={visible && CAMERA_AVAILABLE} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-black">
        {permission?.granted ? (
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr", "code128", "code39", "datamatrix"] }}
            onBarcodeScanned={(result) => handle(result.data)}
          />
        ) : (
          <Permission onClose={onClose} />
        )}
        <View className="gap-3 bg-white p-4">
          <Text testID="scan-progress" className="text-center font-bold text-xl text-brand-ink">
            {scanned.length} of {Math.max(expected, 1)} bags scanned
          </Text>
          {message ? <Text className="text-center text-base text-gray-800">{message}</Text> : null}
          <Button label="Done" onPress={onClose} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export function PhotoCapture({
  visible,
  onPhoto,
  onClose,
}: {
  visible: boolean;
  onPhoto: (uri: string) => void;
  onClose: () => void;
}) {
  const [permission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);

  async function snap() {
    setBusy(true);
    try {
      // Modest quality: a proof photo, sent over mobile data.
      const photo = await camera.current?.takePictureAsync({ quality: 0.5, skipProcessing: true });
      if (photo?.uri) onPhoto(photo.uri);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible && CAMERA_AVAILABLE} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-black">
        {permission?.granted ? (
          <CameraView ref={camera} style={{ flex: 1 }} facing="back" />
        ) : (
          <Permission onClose={onClose} />
        )}
        <View className="gap-3 bg-white p-4">
          <Button label="Take photo" loading={busy} disabled={!permission?.granted} onPress={snap} />
          <Button label="Cancel" variant="secondary" onPress={onClose} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export const cameraAvailable = CAMERA_AVAILABLE;
