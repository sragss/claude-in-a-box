import './style.css'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="terminal-container">
    <header class="terminal-header">
      <h1>Claude in a Box</h1>
      <p>Connect to your DevPod container</p>
    </header>
    <div class="terminal-wrapper">
      <iframe 
        src="http://localhost:3001/wetty" 
        class="terminal-iframe">
      </iframe>
    </div>
    <footer class="terminal-footer">
      <a href="http://localhost:3001/wetty" target="_blank" class="external-link">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
          <polyline points="15,3 21,3 21,9"></polyline>
          <line x1="10" y1="14" x2="21" y2="3"></line>
        </svg>
        Open in new window
      </a>
    </footer>
  </div>
`
