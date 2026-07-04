import React from 'react'

// PATTERN: class component (`export class X extends React.Component`)
// with internal state. Newly supported by the transform's ClassDeclaration
// handling; the runtime tags the class constructor like any other component.
export interface LegacyCounterProps {
  label: string
  step?: number
}

interface LegacyCounterState {
  count: number
}

export class LegacyCounter extends React.Component<
  LegacyCounterProps,
  LegacyCounterState
> {
  override state: LegacyCounterState = { count: 0 }

  increment = () => {
    this.setState((s) => ({ count: s.count + (this.props.step ?? 1) }))
  }

  override render() {
    return (
      <div className="stat-card">
        <div className="stat-value">{this.state.count}</div>
        <div className="stat-label">{this.props.label} (class)</div>
        <button className="btn btn-secondary btn-small" onClick={this.increment}>
          +{this.props.step ?? 1}
        </button>
      </div>
    )
  }
}
