/**
 * The widget injects its own scoped stylesheet so it drops into any page
 * without depending on the host's CSS. Everything is namespaced under `.pc-*`
 * and `[data-pc]`, with a high z-index so it floats above page content.
 * Colours follow the Government of Barbados palette used by the reference
 * prototypes (deep teal / navy / amber).
 */
export const WIDGET_CSS = `
[data-pc]{box-sizing:border-box;font-family:"Figtree",arial,sans-serif}

/* inline text highlight */
mark.pc-hl{background:#fff3c4;border-bottom:2px solid #ffc726;cursor:pointer;padding:0 1px}
mark.pc-hl[data-resolved]{background:#eef0f2;border-bottom-color:#b1b4b6}
mark.pc-hl.pc-flash{animation:pcFlash 1.2s ease}
@keyframes pcFlash{0%,100%{background:#fff3c4}50%{background:#ffd94d}}

/* hover outline while placing */
.pc-hover-outline{outline:2px dashed #0e5f64 !important;outline-offset:2px;cursor:crosshair}
.pc-target-highlight{outline:3px solid #ffc726 !important;outline-offset:2px}
body.pc-placing{cursor:crosshair}

/* floating pins */
.pc-pins{position:absolute;top:0;left:0;width:0;height:0;z-index:9000}
.pc-pin{position:absolute;transform:translate(-50%,-50%);min-width:24px;height:24px;
  background:#0e5f64;color:#fff;border:2px solid #fff;border-radius:12px;font-size:13px;
  font-weight:700;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.3);padding:0 6px;line-height:20px}
.pc-pin[data-resolved]{background:#b1b4b6}
.pc-pin:hover{background:#0a4549}

/* bottom-right toolbar */
.pc-toolbar{position:fixed;right:16px;bottom:16px;z-index:9006;display:flex;gap:8px}
.pc-btn{background:#0e5f64;color:#fff;border:0;border-radius:24px;padding:10px 16px;font-size:15px;
  font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25)}
.pc-btn:hover{background:#0a4549}
.pc-btn:focus-visible{outline:3px solid #ffc726;outline-offset:2px}
.pc-btn[aria-pressed="true"]{background:#ffc726;color:#0b0c0c}
.pc-count{display:inline-block;min-width:18px;padding:0 4px;margin-left:6px;border-radius:9px;
  background:rgba(255,255,255,.25);font-size:13px;text-align:center}

/* right sidebar */
.pc-panel{position:fixed;top:0;right:0;height:100vh;width:360px;max-width:92vw;background:#fff;
  border-left:1px solid #b1b4b6;box-shadow:-2px 0 12px rgba(0,0,0,.15);z-index:9007;
  transform:translateX(100%);transition:transform .2s;display:flex;flex-direction:column}
.pc-panel.pc-open{transform:none}
.pc-head{display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid #b1b4b6;
  background:#00267f;color:#fff}
.pc-head h2{margin:0;font-size:18px;flex:1}
.pc-head button{background:none;border:0;color:#fff;font-size:22px;cursor:pointer;line-height:1}
.pc-sub{display:flex;align-items:center;gap:6px;padding:8px 16px;font-size:14px;color:#505a5f;
  border-bottom:1px solid #e0e4e9}
.pc-list{flex:1;overflow:auto;padding:8px 0}
.pc-empty{padding:24px 16px;color:#505a5f;font-size:15px}
.pc-thread{padding:12px 16px;border-bottom:1px solid #e0e4e9;cursor:pointer}
.pc-thread[data-resolved]{opacity:.6}
.pc-thread[data-orphan]{border-left:3px solid #d4351c}
.pc-quote{font-size:13px;color:#505a5f;border-left:3px solid #ffc726;padding-left:8px;margin-bottom:6px;
  white-space:pre-wrap;word-wrap:break-word}
.pc-orphan-note{font-size:12px;color:#d4351c;margin-bottom:6px}
.pc-msg{margin:6px 0}
.pc-meta{font-size:12px;color:#505a5f}
.pc-body{font-size:15px;margin:2px 0;white-space:pre-wrap;word-wrap:break-word}
.pc-actions{display:flex;gap:10px;margin-top:6px}
.pc-actions button{background:none;border:0;color:#1d70b8;font-size:13px;font-weight:700;cursor:pointer;padding:0}
.pc-reply{display:flex;gap:6px;margin-top:8px}
.pc-reply textarea{flex:1;font:inherit;font-size:14px;border:1px solid #b1b4b6;border-radius:4px;padding:6px;
  resize:vertical;min-height:34px}

/* composer / thread popover */
.pc-popover{position:absolute;z-index:9008;background:#fff;border:1px solid #b1b4b6;border-radius:6px;
  box-shadow:0 4px 16px rgba(0,0,0,.2);padding:10px;width:300px}
.pc-popover textarea{width:100%;font:inherit;font-size:14px;border:1px solid #b1b4b6;border-radius:4px;
  padding:6px;resize:vertical;min-height:60px;box-sizing:border-box}
.pc-field{margin-bottom:8px}
.pc-field label{display:block;font-size:13px;font-weight:700;color:#0b0c0c;margin-bottom:2px}
.pc-field input{width:100%;font:inherit;font-size:14px;border:1px solid #b1b4b6;border-radius:4px;
  padding:6px;box-sizing:border-box}
.pc-row{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}
.pc-action{border:0;border-radius:4px;padding:6px 12px;font-size:14px;font-weight:700;cursor:pointer}
.pc-action--primary{background:#0e5f64;color:#fff}
.pc-action--primary:hover{background:#0a4549}
.pc-action--secondary{background:none;color:#505a5f}

/* placement hint */
.pc-hint{position:fixed;left:50%;bottom:72px;transform:translateX(-50%);z-index:9009;background:#0b0c0c;
  color:#fff;padding:8px 14px;border-radius:6px;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,.3)}
`;
