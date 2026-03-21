import React from "react";
import { Link } from "react-router-dom";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || "The application hit an unexpected error.",
    };
  }

  componentDidCatch(error, info) {
    console.error("App crash captured by error boundary:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="crash-shell">
          <div className="crash-card">
            <span className="eyebrow">Recovery Mode</span>
            <h1>Something broke, but the workspace is still recoverable.</h1>
            <p className="lead">{this.state.message}</p>
            <div className="hero-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => window.location.reload()}
              >
                Reload App
              </button>
              <Link to="/" className="ghost-button">
                Go Home
              </Link>
            </div>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}
