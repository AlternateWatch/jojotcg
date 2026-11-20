import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message || 'Error inesperado en la interfaz.' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#0b090e] p-6">
          <div className="jojo-panel max-w-md space-y-4 p-6 text-center">
            <h1 className="font-jojo-display text-3xl text-[#e6194b] uppercase">
              Error de Interfaz
            </h1>
            <p className="font-mono text-xs text-zinc-300">{this.state.errorMessage}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="jojo-btn-primary px-6 py-2.5 font-jojo-heading text-sm tracking-widest uppercase"
            >
              Recargar Aplicación
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
