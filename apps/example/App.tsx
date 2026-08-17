import {
  Wiro,
  WiroClient,
  WiroError,
  WiroFlux2ProOutputFormat,
  WiroKitInfo,
  WiroTaskFailure,
  type WiroTaskOutput,
  WiroTaskSuccess,
} from '@wiro-ai/wirokit-react-native';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type GenerationState =
  | { kind: 'idle' }
  | { kind: 'loading'; status: string }
  | { kind: 'success'; imageUrl: string }
  | { kind: 'failure'; message: string };

const apiKey = process.env.EXPO_PUBLIC_WIRO_API_KEY?.trim() ?? '';
const apiSecret = process.env.EXPO_PUBLIC_WIRO_API_SECRET?.trim() ?? '';

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [state, setState] = useState<GenerationState>({ kind: 'idle' });
  const abortRef = useRef<AbortController | null>(null);
  const client = useMemo(() => {
    if (apiKey.length === 0) {
      return null;
    }
    return new WiroClient({
      apiKey,
      ...(apiSecret.length === 0 ? {} : { apiSecret }),
    });
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      client?.close();
    };
  }, [client]);

  async function generateImage(): Promise<void> {
    if (state.kind === 'loading') {
      return;
    }

    const trimmed = prompt.trim();
    if (trimmed.length === 0) {
      setState({
        kind: 'failure',
        message: 'Enter a prompt before generating an image.',
      });
      return;
    }

    if (client === null) {
      setState({
        kind: 'failure',
        message: 'Set EXPO_PUBLIC_WIRO_API_KEY before generating an image.',
      });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ kind: 'loading', status: 'Submitting request' });

    try {
      const result = await client.subscribe(
        Wiro.flux2Pro({
          height: 1024,
          outputFormat: WiroFlux2ProOutputFormat.png,
          prompt: trimmed,
          width: 1024,
        }),
        {
          onUpdate(update) {
            const status = update.status?.apiValue;
            if (status !== undefined) {
              setState({ kind: 'loading', status });
            }
          },
          signal: controller.signal,
        },
      );

      if (controller.signal.aborted) {
        return;
      }

      if (result instanceof WiroTaskFailure) {
        setState({
          kind: 'failure',
          message:
            result.task.debugOutput ??
            `Image generation failed (${result.reason}).`,
        });
        return;
      }

      if (!(result instanceof WiroTaskSuccess)) {
        setState({
          kind: 'failure',
          message: 'Image generation failed.',
        });
        return;
      }

      const imageUrl = firstImageUrl(result.task.outputs);
      setState(
        imageUrl === undefined
          ? {
              kind: 'failure',
              message: 'The task completed without an image URL.',
            }
          : { kind: 'success', imageUrl },
      );
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        return;
      }
      setState({
        kind: 'failure',
        message: error instanceof WiroError ? error.message : String(error),
      });
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }

  const isLoading = state.kind === 'loading';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}
    >
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.eyebrow}>WIRO SDK</Text>
        <Text style={styles.title}>Wiro Image Generation</Text>
        <Text style={styles.version}>
          Version {WiroKitInfo.version} · FLUX.2 Pro
        </Text>
        <Text style={styles.subtitle}>
          Describe an image and generate it with Wiro.
        </Text>
        <TextInput
          accessibilityLabel="Imagine"
          editable={!isLoading}
          multiline
          onChangeText={setPrompt}
          onSubmitEditing={() => {
            void generateImage();
          }}
          placeholder="A cinematic mountain lake at sunrise"
          placeholderTextColor="#9AA3B5"
          style={styles.input}
          value={prompt}
        />
        <Pressable
          accessibilityRole="button"
          disabled={isLoading}
          onPress={() => {
            void generateImage();
          }}
          style={[styles.button, isLoading ? styles.buttonDisabled : null]}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonLabel}>Generate image</Text>
          )}
        </Pressable>
        <GenerationResult state={state} />
        <Text style={styles.notice}>
          This direct credential setup is for local development only. Production
          mobile apps should call Wiro through your backend.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function GenerationResult({ state }: { state: GenerationState }) {
  if (state.kind === 'idle') {
    return null;
  }
  if (state.kind === 'loading') {
    return (
      <View style={styles.card}>
        <Text style={styles.cardText}>Task status: {state.status}</Text>
      </View>
    );
  }
  if (state.kind === 'failure') {
    return (
      <View style={[styles.card, styles.errorCard]}>
        <Text style={styles.errorText}>{state.message}</Text>
      </View>
    );
  }
  return (
    <Image
      accessibilityLabel="Generated image"
      source={{ uri: state.imageUrl }}
      style={styles.image}
    />
  );
}

function firstImageUrl(outputs: readonly WiroTaskOutput[]): string | undefined {
  for (const output of outputs) {
    if (output.url !== undefined && output.isImage) {
      return output.url.toString();
    }
  }
  for (const output of outputs) {
    if (output.url !== undefined) {
      return output.url.toString();
    }
  }
  return undefined;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  cardText: {
    color: '#374151',
    fontSize: 15,
  },
  content: {
    flexGrow: 1,
    gap: 16,
    padding: 24,
    paddingTop: 64,
  },
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  errorText: {
    color: '#991B1B',
    fontSize: 15,
  },
  eyebrow: {
    color: '#5B6B8C',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
  },
  image: {
    aspectRatio: 1,
    backgroundColor: '#E5E7EB',
    borderRadius: 12,
    width: '100%',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D1D5DB',
    borderRadius: 12,
    borderWidth: 1,
    color: '#111827',
    fontSize: 16,
    minHeight: 88,
    padding: 12,
    textAlignVertical: 'top',
  },
  notice: {
    color: '#6B7280',
    fontSize: 13,
    textAlign: 'center',
  },
  screen: {
    backgroundColor: '#F5F7FB',
    flex: 1,
  },
  subtitle: {
    color: '#4B5563',
    fontSize: 16,
  },
  title: {
    color: '#111827',
    fontSize: 28,
    fontWeight: '700',
  },
  version: {
    color: '#4B5563',
    fontSize: 16,
  },
});
