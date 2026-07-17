"use client";

import type { ChangeEvent, DragEvent } from "react";
import {
  Box,
  Button,
  Container,
  Flex,
  Grid,
  Heading,
  Text,
} from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "../hooks/auth-context";
import { mapScanResponseToSaveInput } from "@/app/hooks/dashboard-api";
import useSaveDashboard from "@/app/hooks/useSaveDashboard";

type AppState = "idle" | "loading" | "results";

type ScanResponse = {
  confidence: number;
  filename: string;
  predicted_label: string;
  scores: Record<string, number>;
  verdict: string;
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

type VerdictTone = "success" | "error" | "warning";

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

/**
 * Map API verdict strings to UI tone.
 * Firm labels: "AI" / "Real" (confidence >= 85%).
 * Uncertain: "Possibly X" / "Unsure it's X".
 */
function getVerdictTone(value: string): VerdictTone {
  const normalized = value.trim().toLowerCase();

  if (
    normalized.startsWith("possibly ")
    || normalized.startsWith("unsure it's ")
    || normalized.startsWith("unsure it\u2019s ")
  ) {
    return "warning";
  }

  if (normalized === "real" || normalized.endsWith(" real")) {
    return "success";
  }

  return "error";
}

function getVerdictToneToken(tone: VerdictTone, part: "bg" | "text" | "border") {
  if (tone === "warning") {
    if (part === "bg") {
      return "bg.overlay";
    }

    if (part === "border") {
      return "border.subtle";
    }

    return "fg.default";
  }

  return `status.${tone}.${part}`;
}

function getVerdictGlyph(tone: VerdictTone) {
  if (tone === "success") {
    return "✓";
  }

  if (tone === "warning") {
    return "?";
  }

  return "!";
}

function getMetricBarColor(tone: VerdictTone | "success" | "error") {
  if (tone === "success") {
    return "status.success.text";
  }

  if (tone === "error") {
    return "status.error.text";
  }

  return "fg.muted";
}

function isScanResponse(value: unknown): value is ScanResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.confidence === "number"
    && typeof candidate.filename === "string"
    && typeof candidate.predicted_label === "string"
    && typeof candidate.verdict === "string"
    && !!candidate.scores
    && typeof candidate.scores === "object"
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to serialize the selected image."));
    };
    reader.onerror = () => {
      reject(new Error("Unable to read the selected image."));
    };
    reader.readAsDataURL(file);
  });
}

export default function ScanPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [appState, setAppState] = useState<AppState>("idle");
  const [isDragOver, setIsDragOver] = useState(false);
  const [animateProgress, setAnimateProgress] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const timeoutIds = useRef<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dropzoneRef = useRef<HTMLDivElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const lastClipboardUploadAtRef = useRef(0);
  const {
    saveDashboard,
    loading: saveDashboardLoading,
    error: saveDashboardError,
  } = useSaveDashboard();

  const clearSimulationTimers = () => {
    timeoutIds.current.forEach(timeoutId => window.clearTimeout(timeoutId));
    timeoutIds.current = [];
  };

  const replacePreview = (file: File) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    previewUrlRef.current = nextPreviewUrl;
    setPreviewUrl(nextPreviewUrl);
  };

  const validateFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      return "Please upload an image file.";
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return "Images must be 10MB or smaller.";
    }

    return null;
  };

  const uploadFile = async (file: File) => {
    const validationError = validateFile(file);

    if (validationError) {
      setErrorMessage(validationError);
      setAppState("idle");
      return;
    }

    clearSimulationTimers();
    replacePreview(file);
    setSelectedFile(file);
    setErrorMessage(null);
    setAnimateProgress(false);
    setAppState("loading");

    const formData = new FormData();
    formData.append("image", file);

    try {
      const response = await fetch("/scan/ai-scan", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => null)) as
        | Record<string, unknown>
        | null;

      if (!response.ok) {
        const nextError
          = payload && "detail" in payload && typeof payload.detail === "string"
            ? payload.detail
            : payload && "message" in payload && typeof payload.message === "string"
              ? payload.message
              : "Scan failed. Please try again.";

        throw new Error(nextError);
      }

      if (!isScanResponse(payload)) {
        throw new Error("The scan response was incomplete.");
      }

      setResult({
        confidence: payload.confidence,
        filename: payload.filename,
        predicted_label: payload.predicted_label,
        scores: payload.scores,
        verdict: payload.verdict,
      });
      setAppState("results");

      timeoutIds.current.push(
        window.setTimeout(() => {
          setAnimateProgress(true);
        }, 100),
      );
    }
    catch (error) {
      setResult(null);
      setAppState("idle");
      setErrorMessage(
        error instanceof Error ? error.message : "Scan failed. Please try again.",
      );
    }
  };

  const handleSaveToDashboard = async () => {
    if (!isAuthenticated) {
      router.push(`/login?redirect=${encodeURIComponent("/scan")}`);
      return;
    }

    if (!result || !selectedFile) {
      return;
    }

    try {
      const imageDataUrl = await readFileAsDataUrl(selectedFile);
      const payload = mapScanResponseToSaveInput({
        confidence: result.confidence,
        file: selectedFile,
        predictedLabel: result.predicted_label,
        scores: result.scores,
        verdict: result.verdict,
        imageDataUrl,
      });
      const savedScan = await saveDashboard(payload);

      if (savedScan) {
        router.push("/dashboard");
      }
    }
    catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to save this scan to the dashboard.",
      );
    }
  };

  const handleFileSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    await uploadFile(file);
    event.target.value = "";
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);

    const file = event.dataTransfer.files?.[0];

    if (!file) {
      return;
    }

    await uploadFile(file);
  };

  const isRecentClipboardUpload = () => Date.now() - lastClipboardUploadAtRef.current < 500;

  const markClipboardUpload = () => {
    lastClipboardUploadAtRef.current = Date.now();
  };

  const getImageFromClipboardEvent = (event: ClipboardEvent) => {
    const clipboardData = event.clipboardData;

    if (!clipboardData) {
      return null;
    }

    const fileCandidate = Array.from(clipboardData.files ?? []).find(file => file.type.startsWith("image/"));

    if (fileCandidate) {
      return fileCandidate;
    }

    const imageItem = Array.from(clipboardData.items ?? []).find(item => item.type.startsWith("image/"));

    return imageItem?.getAsFile() ?? null;
  };

  const handlePaste = async (event: ClipboardEvent) => {
    const file = getImageFromClipboardEvent(event);

    if (!file) {
      return;
    }

    if (isRecentClipboardUpload()) {
      return;
    }

    event.preventDefault();
    markClipboardUpload();
    setErrorMessage(null);

    await uploadFile(file);
  };

  const handlePasteShortcut = async (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "v") {
      return;
    }

    if (isRecentClipboardUpload()) {
      return;
    }

    if (!navigator.clipboard || typeof navigator.clipboard.read !== "function") {
      return;
    }

    try {
      const clipboardItems = await navigator.clipboard.read();

      for (const item of clipboardItems) {
        const imageType = item.types.find(type => type.startsWith("image/"));

        if (!imageType) {
          continue;
        }

        const imageBlob = await item.getType(imageType);
        const extension = imageType.split("/")[1] ?? "png";
        const file = new File([imageBlob], `pasted-image.${extension}`, { type: imageType });

        markClipboardUpload();
        setErrorMessage(null);
        await uploadFile(file);
        return;
      }
    }
    catch {
      // Ignore clipboard permission/read errors and rely on regular paste events.
    }
  };

  useEffect(() => {
    document.addEventListener("paste", handlePaste, true);
    window.addEventListener("paste", handlePaste);
    window.addEventListener("keydown", handlePasteShortcut);

    return () => {
      document.removeEventListener("paste", handlePaste, true);
      window.removeEventListener("paste", handlePaste);
      window.removeEventListener("keydown", handlePasteShortcut);
      clearSimulationTimers();

      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (appState === "idle") {
      dropzoneRef.current?.focus();
    }
  }, [appState]);

  const resetApp = () => {
    clearSimulationTimers();
    setAppState("idle");
    setAnimateProgress(false);
    setIsDragOver(false);
    setErrorMessage(null);
    setResult(null);
    setSelectedFile(null);

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }

    setPreviewUrl(null);
  };

  const verdict = result?.verdict ?? result?.predicted_label ?? "Unknown";
  const verdictTone = getVerdictTone(verdict);
  type ScoreMetric = {
    label: string;
    value: number;
    tone: VerdictTone;
  };

  const scoreMetrics: ScoreMetric[] = result
    ? [
        {
          label: "AI score",
          value: result.scores.Ai ?? result.scores.AI ?? 0,
          tone: "error",
        },
        {
          label: "Real score",
          value: result.scores.Real ?? 0,
          tone: "success",
        },
        {
          label: "Model confidence",
          value: result.confidence,
          tone: verdictTone,
        },
      ]
    : [];

  return (
    <Container maxW="1200px" px={{ base: "4", md: "6" }} py="8" mx="auto">
      <Box animation="fadeIn 0.4s ease-out" mt="8">
        <Box textAlign="center" mb="12">
          <Heading as="h1" fontSize="2.5rem" mb="2">
            Detect AI-Generated Content
          </Heading>
          <Text color="fg.muted" fontSize="1.1rem">
            Upload an image to analyze noise patterns, metadata, and pixel artifacts.
          </Text>
        </Box>

        {appState === "idle"
          ? (
              <Box
                ref={dropzoneRef}
                borderWidth="2px"
                borderStyle="dashed"
                borderColor={isDragOver ? "brand.primary" : "border.default"}
                borderRadius="panel"
                px="8"
                py="16"
                textAlign="center"
                maxW="800px"
                mx="auto"
                transition="border-color 0.3s, background-color 0.3s"
                _hover={{ borderColor: "brand.primary", bg: "bg.overlay" }}
                bg={isDragOver ? "bg.overlay" : "bg.panel"}
                tabIndex={0}
                onPaste={(event) => {
                  void handlePaste(event.nativeEvent);
                }}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDragOver(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setIsDragOver(false);
                }}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={handleFileSelection}
                />
                <Box color="fg.muted" mb="4" display="inline-flex" alignItems="center" gap="2">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.36 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" />
                  </svg>
                </Box>
                <Heading as="h3" fontSize="1.17rem" mb="2">
                  Drag and drop your image here
                </Heading>
                <Text color="fg.muted" mb="6" fontSize="0.9rem">
                  Supports JPG, PNG, WEBP (Max 10MB)
                </Text>
                <Text color="fg.subtle" mb="6" fontSize="0.9rem">
                  Or paste an image with Ctrl+V
                </Text>
                <Button
                  height="auto"
                  minW="auto"
                  bg="brand.primary"
                  color="bg.panel"
                  px="5"
                  py="3"
                  borderRadius="control"
                  fontWeight="600"
                  fontSize="1rem"
                  transition="all 0.2s ease"
                  _hover={{ bg: "brand.hover", transform: "translateY(-1px)" }}
                  _active={{ transform: "translateY(0)" }}
                  onClick={() => {
                    fileInputRef.current?.click();
                  }}
                >
                  Browse Files
                </Button>
                {errorMessage
                  ? (
                      <Text mt="4" color="status.error.text" fontSize="0.95rem">
                        {errorMessage}
                      </Text>
                    )
                  : null}
              </Box>
            )
          : null}

        {appState === "loading"
          ? (
              <Box display="block" textAlign="center" my="16">
                <Box
                  width="40px"
                  height="40px"
                  borderWidth="4px"
                  borderStyle="solid"
                  borderColor="border.subtle"
                  borderTopColor="brand.primary"
                  borderRadius="full"
                  animation="spin 1s linear infinite"
                  mx="auto"
                  mb="4"
                />
                <Text color="fg.muted">Running neural network analysis...</Text>
                {previewUrl
                  ? (
                      <Box mt="6">
                        <Text color="fg.subtle" fontSize="0.95rem" mb="4">
                          Uploading
                          {" "}
                          {result?.filename ?? "selected image"}
                        </Text>
                        <img
                          src={previewUrl}
                          alt="Selected upload preview"
                          style={{
                            maxWidth: "320px",
                            margin: "0 auto",
                            borderRadius: "12px",
                            border: "1px solid var(--chakra-colors-border-subtle)",
                          }}
                        />
                      </Box>
                    )
                  : null}
              </Box>
            )
          : null}

        {appState === "results" && result
          ? (
              <Box
                display="block"
                bg="bg.panel"
                borderWidth="1px"
                borderColor="border.subtle"
                borderRadius="panel"
                overflow="hidden"
                boxShadow="panel"
              >
                <Flex
                  px="6"
                  py="6"
                  borderBottomWidth="1px"
                  borderColor="border.subtle"
                  justify="space-between"
                  align={{ base: "flex-start", sm: "center" }}
                  direction={{ base: "column", sm: "row" }}
                  gap="4"
                >
                  <Heading as="h2" fontSize="1.5rem">
                    Analysis Report
                  </Heading>
                  <Button
                    height="auto"
                    minW="auto"
                    bg="transparent"
                    color="fg.muted"
                    px="4"
                    py="3"
                    borderRadius="control"
                    fontWeight="600"
                    fontSize="1rem"
                    transition="all 0.2s ease"
                    _hover={{ bg: "border.subtle", color: "fg.default" }}
                    _active={{ bg: "border.subtle" }}
                    onClick={resetApp}
                  >
                    Scan Another Image
                  </Button>
                </Flex>

                <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }}>
                  <Flex
                    borderRightWidth="1px"
                    borderColor="border.subtle"
                    bg="bg.input"
                    align="center"
                    justify="center"
                    p="8"
                  >
                    <img
                      src={previewUrl ?? undefined}
                      alt="Uploaded Preview"
                      style={{
                        maxWidth: "100%",
                        borderRadius: "8px",
                        border: "1px solid var(--chakra-colors-border-subtle)",
                      }}
                    />
                  </Flex>

                  <Box p="8">
                    <Flex
                      display="inline-flex"
                      align="center"
                      gap="2"
                      px="6"
                      py="3"
                      borderRadius="9999px"
                      fontWeight="700"
                      fontSize="1.25rem"
                      mb="8"
                      bg={getVerdictToneToken(verdictTone, "bg")}
                      color={getVerdictToneToken(verdictTone, "text")}
                      borderWidth="1px"
                      borderColor={getVerdictToneToken(verdictTone, "border")}
                    >
                      <Text as="span">{getVerdictGlyph(verdictTone)}</Text>
                      <Text as="span">
                        {formatPercent(result.confidence)}
                        {" "}
                        {verdict}
                      </Text>
                    </Flex>

                    <Text color="fg.subtle" fontSize="0.95rem" mb="6">
                      {result.filename}
                    </Text>

                    {scoreMetrics.map((metric) => {
                      const toneColor = getMetricBarColor(metric.tone);

                      return (
                        <Box key={metric.label} mb="6">
                          <Flex
                            justify="space-between"
                            mb="2"
                            fontSize="0.9rem"
                            color="fg.subtle"
                          >
                            <Text>{metric.label}</Text>
                            <Text>{formatPercent(metric.value)}</Text>
                          </Flex>
                          <Box width="100%" height="8px" bg="bg.input" borderRadius="4px" overflow="hidden">
                            <Box
                              height="100%"
                              bg={toneColor}
                              transition="width 1s ease-out"
                              width={animateProgress ? formatPercent(metric.value) : "0%"}
                            />
                          </Box>
                        </Box>
                      );
                    })}

                    <Text mt="8" fontSize="0.9rem" color="fg.subtle" lineHeight="1.5">
                      <Text as="strong" color="fg.default">
                        System Notes:
                      </Text>
                      {" "}
                      Raw model class is
                      {" "}
                      {result.predicted_label}
                      {" "}
                      at
                      {" "}
                      {formatPercent(result.confidence)}
                      {" "}
                      confidence. Verdict
                      {" "}
                      {verdict}
                      {" "}
                      uses confidence bands: firm at ≥85%, Possibly at 65–85%, and
                      Unsure below 65%. Compare the AI and Real score bars for how
                      decisive the classification was.
                    </Text>

                    <Button
                      mt="10"
                      bg="brand.primary"
                      color="fg.inverted"
                      px="6"
                      py="4"
                      borderRadius="action"
                      fontWeight="600"
                      fontSize="1.125rem"
                      transition="all 0.2s ease"
                      _hover={{ bg: "brand.hover", transform: "translateY(-1px)" }}
                      _active={{ transform: "translateY(0)" }}
                      disabled={!selectedFile || saveDashboardLoading || authLoading}
                      onClick={() => {
                        void handleSaveToDashboard();
                      }}
                    >
                      {saveDashboardLoading
                        ? "Saving..."
                        : !isAuthenticated
                            ? "Log In To Save"
                            : "Save To Dashboard"}
                    </Button>
                    {saveDashboardError
                      ? (
                          <Text mt="3" color="status.error.text" fontSize="0.95rem">
                            {saveDashboardError.message}
                          </Text>
                        )
                      : null}

                  </Box>
                </Grid>
              </Box>
            )
          : null}
      </Box>
    </Container>
  );
}
