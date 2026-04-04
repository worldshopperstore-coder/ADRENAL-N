import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
          <div className="bg-gray-900 border border-red-800/40 rounded-2xl p-8 max-w-md w-full text-center">
            <div className="w-14 h-14 bg-red-600/20 border border-red-600/40 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <span className="text-2xl">⚠️</span>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Bir hata oluştu</h2>
            <p className="text-sm text-gray-400 mb-6">
              Uygulama beklenmeyen bir hatayla karşılaştı. Sayfayı yenileyerek tekrar deneyebilirsiniz.
            </p>
            <button
              onClick={this.handleReload}
              className="w-full bg-red-600 hover:bg-red-500 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
            >
              Sayfayı Yenile
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
