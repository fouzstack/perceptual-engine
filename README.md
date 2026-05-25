# Perceptual Engine

> Adaptive perceptual rendering engine for React.
> Incremental virtualization, DOM recycling, hybrid rendering and perceptual scheduling.

---

## Why Perceptual Engine?

Traditional virtualization libraries still rely heavily on React reconciliation.

Perceptual Engine takes a different approach:

- Incremental portal caching
- DOM persistence
- Recycling-aware rendering
- Imperative geometry engine
- Adaptive scheduling
- Batched measurements
- Predictive viewport rendering
- Perceptual scroll optimization

The result is extremely stable rendering for:

- complex forms
- huge datasets
- Android WebViews
- enterprise dashboards
- adaptive interfaces
- high-frequency updates

---

# Features

## Incremental Rendering

Only changed nodes are updated.

No full portal reconstruction.

---

## Intelligent DOM Recycling

DOM nodes are recycled semantically:

- created
- recycled
- updated
- removed

This dramatically reduces:

- garbage collection
- layout thrashing
- React commits

---

## Hybrid React + Imperative Rendering

React renders content.

The engine controls:

- geometry
- transforms
- viewport
- scheduling
- recycling

This separation massively improves runtime stability.

---

## Shared ResizeObserver

Single observer architecture with batched measurements.

Avoids observer storms and resize cascades.

---

## Batched Measurements

Measurements are grouped using `requestAnimationFrame`.

Prevents:

- forced reflows
- layout thrashing
- frame instability

---

## Adaptive GPU Compositing

Optional GPU acceleration:

```tsx
<PerceptualList enableGPUCompositing />
```

Can be disabled for legacy Android WebViews.

---

## Scroll Restoration

Advanced scroll persistence strategies:

- anchor-based restoration
- velocity-aware restoration
- perceptual restoration

---

## Incremental Portal Cache

Portals are cached incrementally.

Only modified portals are recreated.

This drastically reduces React reconciliation overhead.

---

# Installation

```bash
npm install perceptual-engine
```

or

```bash
pnpm add perceptual-engine
```

---

# Basic Usage

```tsx
import { PerceptualList } from 'perceptual-engine';

function App() {
  return (
    <PerceptualList
      items={items}
      estimatedItemSize={60}
      overscan="auto"
      enableGPUCompositing
      renderItem={(item, index) => (
        <div>
          {item.name}
        </div>
      )}
    />
  );
}
```

---

# Advanced Example

```tsx
<PerceptualList
  items={products}
  estimatedItemSize={80}
  overscan="auto"
  persistenceKey="products-scroll"
  enableGPUCompositing
  showPerformanceOverlay
  onVisibleRangeChange={(start, end) => {
    console.log(start, end);
  }}
  renderItem={(product) => (
    <ProductForm product={product} />
  )}
/>
```

---

# Architecture

```txt
React
   ↓
PerceptualList
   ↓
PerceptualEngine
   ↓
ViewportManager
   ↓
RecyclingPool
   ↓
Imperative DOM Layer
```

---

# Internal Rendering Pipeline

```txt
1. Scroll Phase
2. Viewport Calculation
3. Predictive Range Expansion
4. Recycling Resolution
5. DOM Mutation Batch
6. React Portal Reconciliation
7. GPU Transform Commit
```

---

# Performance Goals

Perceptual Engine is designed for:

- 10k+ items
- complex forms
- adaptive dashboards
- mobile WebViews
- low-GC rendering
- stable frame pacing

---

# Designed For

## Excellent Fit

- enterprise dashboards
- POS systems
- inventory systems
- chat applications
- financial interfaces
- Android WebViews
- massive forms
- infinite feeds

---

## Less Ideal For

- tiny lists
- static content
- simple rendering cases

---

# API

## PerceptualList Props

| Prop | Type | Description |
|---|---|---|
| items | `T[]` | Items array |
| renderItem | `(item, index) => ReactNode` | Item renderer |
| estimatedItemSize | `number` | Estimated height |
| overscan | `number \| 'auto'` | Overscan strategy |
| enableGPUCompositing | `boolean` | GPU acceleration |
| persistenceKey | `string` | Scroll persistence |
| showPerformanceOverlay | `boolean` | Debug overlay |

---

# Current Status

## Experimental / Advanced Alpha

The engine is stable and functional, but still evolving.

The architecture is already suitable for real-world testing and advanced production experimentation.

---

# Known Limitations

## Portal Scaling

React portals still introduce overhead at extreme scales.

Future versions may implement:

- portal-less rendering
- custom reconciler paths
- static node snapshots

---

## Android Legacy WebViews

Some legacy Android WebViews may experience:

- focus instability
- IME flicker
- transform issues

Mitigation:

```tsx
enableGPUCompositing={false}
```

---

# Roadmap

- [ ] Measurement stabilization API
- [ ] Focus preservation layer
- [ ] Frame phase separation
- [ ] Portal-less rendering
- [ ] Custom reconciler experiments
- [ ] Worker-based scheduling
- [ ] Predictive pre-rendering

---

# Philosophy

Perceptual Engine is not just another virtual list.

It is an experimental rendering runtime exploring:

- perceptual scheduling
- hybrid rendering
- DOM persistence
- adaptive reconciliation
- geometry-driven rendering

---

# Benchmarks (Coming Soon)

Planned comparisons against:

- react-window
- react-virtualized
- tanstack virtual

Metrics:

- dropped frames
- GC pressure
- commit count
- layout stability
- memory retention

---

# Contributing

Contributions, experiments and profiling reports are welcome.

Especially interested in:

- Android WebView testing
- low-end devices
- large forms
- React concurrent rendering
- edge-case profiling

---

# License

MIT

---

# Inspiration

Inspired by ideas from:

- React Fiber
- React Native Fabric
- Litho
- Flutter viewport systems
- Incremental rendering architectures
