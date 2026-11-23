import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@heroui/react";
import { TriangleExclamation } from "@gravity-ui/icons";

interface Props {
  children: ReactNode;
  /** Cambiarlo limpia el error (p. ej. al cambiar de vista). */
  resetKey: unknown;
  onHome: () => void;
}

interface State {
  error: Error | null;
  key: unknown;
}

/** Evita que un error de render deje la ventana en negro: muestra el error y permite volver. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ReelCut: error de interfaz", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="flex max-w-xl flex-col items-center gap-4 rounded-3xl bg-surface p-8 text-center">
          <TriangleExclamation className="size-10 text-danger" />
          <h2 className="text-xl font-semibold">Algo salió mal</h2>
          <p className="text-sm text-muted">
            La vista falló, pero tus archivos no se modificaron. Si el proyecto tenía cambios sin guardar, podrían
            haberse perdido.
          </p>
          <pre className="max-h-40 w-full select-text overflow-auto rounded-xl bg-background p-3 text-left text-xs text-danger">
            {error.message}
          </pre>
          <div className="flex gap-2">
            <Button variant="secondary" onPress={() => this.setState({ error: null })}>
              Reintentar
            </Button>
            <Button onPress={this.props.onHome}>Volver al inicio</Button>
          </div>
        </div>
      </div>
    );
  }
}
