export default function Timeline({
  keyframes, activeKeyframe, onSelectKeyframe,
  onAddKeyframe, onDuplicateKeyframe, onRemoveKeyframe,
  isPlaying, playT, onPlay, onStop,
  onShare, shareCopied,
}) {
  const totalFrames = keyframes.length
  const progress = totalFrames > 1 ? (playT / (totalFrames - 1)) * 100 : 0

  return (
    <div className="timeline">
      <div className="timeline-controls">
        <button
          className={isPlaying ? 'btn-stop' : 'btn-play'}
          onClick={isPlaying ? onStop : onPlay}
          disabled={totalFrames < 2}
          title={totalFrames < 2 ? 'Add at least 2 frames to animate' : ''}
        >
          {isPlaying ? '⏹ Stop' : '▶ Play'}
        </button>
        <button className="btn-secondary" onClick={onAddKeyframe} disabled={isPlaying}>
          + Frame
        </button>
        <button className="btn-secondary" onClick={onDuplicateKeyframe} disabled={isPlaying}
          title="Copy this frame's effects, text, arrows, etc. into the next frame">
          ⧉ Duplicate
        </button>
        <button
          className="btn-secondary"
          onClick={onShare}
          disabled={isPlaying || keyframes.length < 2}
          title={keyframes.length < 2 ? 'Add at least 2 frames to share' : 'Copy shareable viewer link'}
        >
          {shareCopied ? '✓ Copied!' : '🔗 Share'}
        </button>
        <span className="frame-label">
          {isPlaying
            ? `Playing… (${Math.min(Math.floor(playT) + 1, totalFrames)} / ${totalFrames})`
            : `Frame ${activeKeyframe + 1} of ${totalFrames}`}
        </span>
      </div>

      <div className="timeline-track">
        {isPlaying && (
          <div className="playhead" style={{ left: `${progress}%` }} />
        )}
        {keyframes.map((_, i) => (
          <div
            key={i}
            className={`keyframe-box ${activeKeyframe === i && !isPlaying ? 'active' : ''} ${isPlaying && Math.floor(playT) === i ? 'current' : ''}`}
            onClick={() => !isPlaying && onSelectKeyframe(i)}
          >
            <span>{i + 1}</span>
            {totalFrames > 1 && !isPlaying && (
              <button
                className="frame-remove"
                onClick={e => { e.stopPropagation(); onRemoveKeyframe(i) }}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      <p className="timeline-hint">
        Switch frames to move players to different positions, then hit Play to animate.
      </p>
    </div>
  )
}
