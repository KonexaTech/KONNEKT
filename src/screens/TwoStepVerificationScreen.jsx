import { Alert } from '../components/Alert';
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
} from "react-native";
import { supabase } from "../lib_supabase";

function qrImageUri(value = "") {
  const comma = value.indexOf(",");
  const svg = value.trim().startsWith("<svg")
    ? value
    : value.startsWith("data:image/svg+xml") &&
        comma >= 0 &&
        value
          .slice(comma + 1)
          .trim()
          .startsWith("<svg")
      ? value.slice(comma + 1)
      : null;
  return svg
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    : value;
}

export default function TwoStepVerificationScreen({ navigation }) {
  const [factor, setFactor] = useState(null);
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const pending = factor?.status === "unverified";
  const verified = factor?.status === "verified";
  const load = useCallback(async () => {
    setBusy(true);
    setLoadFailed(false);
    setNotice("");
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      const totp = (data?.all || []).filter(
        (item) => item.factor_type === "totp",
      );
      setFactor(
        totp.find((item) => item.status === "verified") ||
          totp.find((item) => item.status === "unverified") ||
          null,
      );
    } catch (error) {
      setLoadFailed(true);
      setNotice(error.message || "Could not load authenticator settings.");
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const begin = async () => {
    if (busy || factor || loadFailed) return;
    setBusy(true);
    setNotice("");
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "KONNEKT authenticator",
      });
      if (error) throw error;
      if (!data?.id || !data?.totp?.secret)
        throw new Error(
          "Authenticator setup did not return a usable setup key.",
        );
      setFactor({ id: data.id, status: "unverified", factor_type: "totp" });
      setQr(qrImageUri(data.totp.qr_code));
      setSecret(data.totp.secret);
      setCode("");
    } catch (error) {
      setNotice(error.message || "Could not start authenticator setup.");
    } finally {
      setBusy(false);
    }
  };
  const verifyCode = async () => {
    if (!factor?.id || !/^\d{6}$/.test(code))
      throw new Error("Enter the current six-digit authenticator code.");
    const { data: challenge, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId: factor.id });
    if (challengeError) throw challengeError;
    const { error } = await supabase.auth.mfa.verify({
      factorId: factor.id,
      challengeId: challenge.id,
      code,
    });
    if (error) throw error;
  };
  const verify = async () => {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      await verifyCode();
      setQr("");
      setSecret("");
      setCode("");
      await load();
      Alert.alert(
        "Authenticator verified",
        "Your authenticator factor has been verified with Supabase.",
      );
    } catch (error) {
      setNotice(
        error.message || "The authenticator code could not be verified.",
      );
    } finally {
      setBusy(false);
    }
  };
  const remove = () => {
    if (busy || !factor) return;
    Alert.alert(
      pending ? "Discard pending setup?" : "Remove authenticator?",
      pending
        ? "Remove this unfinished setup so you can start again. A verified authenticator will not be removed."
        : "Enter a current authenticator code before confirming removal.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: pending ? "Discard setup" : "Remove",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            setNotice("");
            try {
              if (verified) await verifyCode();
              const { error } = await supabase.auth.mfa.unenroll({
                factorId: factor.id,
              });
              if (error) throw error;
              setQr("");
              setSecret("");
              setCode("");
              setFactor(null);
              await load();
            } catch (error) {
              setNotice(
                error.message || "Could not remove this authenticator setup.",
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };
  return (
    <ScrollView style={s.page} contentContainerStyle={s.content}>
      <TouchableOpacity
        accessibilityRole="button"
        onPress={() => navigation.goBack()}
      >
        <Text style={s.back}>‹ Back</Text>
      </TouchableOpacity>
      <Text style={s.title}>Two-step verification</Text>
      <View style={s.card}>
        <Text style={s.heading}>
          {verified
            ? "Authenticator enabled"
            : pending
              ? "Authenticator setup pending"
              : "Authenticator not enabled"}
        </Text>
        <Text style={s.body}>
          Use an authenticator app to generate time-based sign-in codes.
        </Text>
        {busy && (
          <ActivityIndicator color="#B781EA" style={{ marginTop: 15 }} />
        )}
        {!factor && !loadFailed && (
          <TouchableOpacity
            accessibilityRole="button"
            style={s.button}
            disabled={busy}
            onPress={begin}
          >
            <Text style={s.buttonText}>Set up authenticator</Text>
          </TouchableOpacity>
        )}
        {loadFailed && (
          <TouchableOpacity
            accessibilityRole="button"
            style={s.button}
            disabled={busy}
            onPress={load}
          >
            <Text style={s.buttonText}>Retry authenticator settings</Text>
          </TouchableOpacity>
        )}
        {pending && (
          <>
            {!!qr && (
              <>
                <Text style={s.label}>
                  Scan this QR code with your authenticator app
                </Text>
                <Image
                  accessibilityLabel="Authenticator setup QR code"
                  source={{ uri: qr }}
                  style={s.qr}
                  resizeMode="contain"
                />
              </>
            )}
            {!!secret && (
              <>
                <Text style={s.secretLabel}>Manual setup key</Text>
                <Text selectable style={s.secret}>
                  {secret}
                </Text>
              </>
            )}
            {!secret && (
              <Text style={s.body}>
                A setup was started earlier. Enter its current code if you kept
                the setup key, or discard it and start again.
              </Text>
            )}
          </>
        )}
        {(pending || verified) && (
          <TextInput
            accessibilityLabel="Authenticator code"
            style={s.input}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            autoCorrect={false}
            maxLength={6}
            placeholder="Six-digit authenticator code"
            placeholderTextColor="#BBA9CC"
          />
        )}
        {pending && (
          <TouchableOpacity
            accessibilityRole="button"
            style={s.button}
            disabled={busy}
            onPress={verify}
          >
            <Text style={s.buttonText}>Verify and enable</Text>
          </TouchableOpacity>
        )}
        {(pending || verified) && (
          <TouchableOpacity
            accessibilityRole="button"
            style={s.remove}
            disabled={busy}
            onPress={remove}
          >
            <Text style={s.buttonText}>
              {pending ? "Discard pending setup" : "Remove authenticator"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={s.note}>
        Authenticator enrollment is available. Application-wide enforcement at
        sign-in and in protected data access remains a separate release
        requirement.
      </Text>
      {!!notice && (
        <Text accessibilityRole="alert" style={s.notice}>
          {notice}
        </Text>
      )}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#10091B" },
  content: { padding: 18, paddingBottom: 40 },
  back: { color: "#D8B8F5", fontSize: 16, marginTop: 12 },
  title: {
    color: "#FFF",
    fontSize: 28,
    fontWeight: "800",
    marginTop: 20,
    marginBottom: 20,
  },
  card: {
    backgroundColor: "#241630",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "#503567",
  },
  heading: { color: "#FFF", fontSize: 18, fontWeight: "800" },
  body: { color: "#A9B8CB", lineHeight: 21, marginTop: 8 },
  button: {
    backgroundColor: "#6A0DAD",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 18,
  },
  buttonText: { color: "#FFF", fontWeight: "800" },
  label: {
    color: "#DDEBFA",
    fontWeight: "700",
    marginTop: 18,
    marginBottom: 12,
  },
  qr: {
    width: 210,
    height: 210,
    alignSelf: "center",
    backgroundColor: "#FFF",
    borderRadius: 8,
  },
  secretLabel: { color: "#C4B4D0", fontSize: 11, marginTop: 12 },
  secret: { color: "#FFF", fontWeight: "700", marginTop: 5 },
  input: {
    backgroundColor: "#0B192B",
    borderRadius: 10,
    padding: 14,
    color: "#FFF",
    marginTop: 14,
  },
  remove: {
    backgroundColor: "#A92F45",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 18,
  },
  note: { color: "#BBA9CC", fontSize: 11, lineHeight: 18, marginTop: 18 },
  notice: { color: "#FFB6C0", marginTop: 14, lineHeight: 19 },
});
