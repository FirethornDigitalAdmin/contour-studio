import { Component, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

export default class WorkspaceBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div className="empty-preview" role="alert">
      <TriangleAlert size={32} />
      <h3>This view could not open.</h3>
      <p>Your settings are still in the sidebar. Try opening the view again, or reload the app.</p>
      <button onClick={() => this.setState({ failed: false })}>Try this view again</button>
    </div> : this.props.children;
  }
}
