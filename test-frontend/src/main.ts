import './style.css'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <h1>Claude in a Box - Terminal</h1>
    <p>Connect to your DevPod container:</p>
    <iframe 
      src="http://localhost:3001/wetty" 
      width="100%" 
      height="600px" 
      style="border: 1px solid #ccc; border-radius: 8px;">
    </iframe>
    <p><a href="http://localhost:3001/wetty" target="_blank">Open terminal in new window</a></p>
  </div>
`
