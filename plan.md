Below is a **copy-pasteable run-book** your intern can follow to stand up an on-demand cloud VM that opens straight into a browser terminal—no IDEs, no editors, just a shell.

---

## 0 . High-level architecture

```
┌───────────────┐    HTTPS/WS    ┌─────────────┐   SSH   ┌───────────────┐
│  React front  │ ─────────────▶ │  Wetty pod  │ ───────▶│   DevPod VM   │
│  end (iframe) │                │(middle srv) │         │(EC2, etc.)    │
└───────────────┘                └─────────────┘         └───────────────┘
```

*We’ll implement the “middle server” first, using **DevPod** to spin the VM and **Wetty** to expose it.*

---

## 1 . Provision a *middle server*

| Component      | Notes                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| **OS**         | Ubuntu 22.04 LTS t3.small (or any host with Docker + KVM)                                             |
| **Open ports** | 22 (SSH), 80/443 (reverse proxy), *dynamic* ports for Wetty containers (we’ll NAT them through Nginx) |
| **Packages**   | `docker`, `jq`, `uuid-runtime`, `openssh-client`, `curl`                                              |

---

## 2 . Install DevPod CLI

```bash
curl -fsSL https://raw.githubusercontent.com/loft-sh/devpod/main/install.sh | bash
exec $SHELL -l
devpod version   # sanity-check
```

DevPod is a single binary; no server component needed. ([devpod.sh][1])

---

## 3 . Register a **machine provider** (AWS example)

```bash
# 1) Export AWS creds that have EC2FullAccess or tighter IAM
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_REGION=us-east-1

# 2) Add the provider once:
devpod provider add ec2 --name ec2-prod
```

DevPod stores the creds locally and now knows how to launch VMs instead of containers. ([dev.to][2])

---

## 4 . One-shot **bootstrap script**

Save the snippet below as `/opt/wetty_launch.sh` on the middle server and `chmod +x` it.

```bash
#!/usr/bin/env bash
# Spin a VM + expose Wetty  ➜ https://<middle>/terminal/<sid>

set -euo pipefail
SID=$(uuidgen | cut -c1-8)

# 1. ephemeral SSH key for this session
KEY="/tmp/key_${SID}"
ssh-keygen -q -t ed25519 -N '' -f "${KEY}"

# 2. Launch the VM (no IDE!)
devpod up ubuntu:22.04 \
  --name "$SID" \
  --ssh-key-path "${KEY}.pub" \
  --ide none \  # important! no VS Code popup :contentReference[oaicite:2]{index=2}
  --provider ec2-prod \
  --size t3.small

# 3. Grab connection details
read HOST PORT USER <<<"$(devpod info "$SID" --json | \
  jq -r '.sshHost, .sshPort, .sshUser')"

# 4. Start Wetty, namespaced by the session ID
docker run -d --rm --name wetty_${SID} \
  -p 0:3000 \
  wettyoss/wetty \
    --base-path "/terminal/${SID}" \
    --ssh-host "${HOST}" \
    --ssh-port "${PORT}" \
    --ssh-user "${USER}" \
    --ssh-auth ed25519 \
    --ssh-key "${KEY}"

echo "🎉 Shell ready at  https://middle.example.com/terminal/${SID}"
```

*What’s happening?*
`--ide none` tells DevPod to create the VM **without** launching VS Code, exactly what we want ([devpod.sh][3]).
Wetty’s `--ssh-host/-user/-key` flags make the container open an SSH channel the moment the browser connects ([github.com][4]).

---

## 5 . Nginx (or Traefik) reverse-proxy rule

```nginx
location /terminal/ {
    proxy_pass http://127.0.0.1:$upstream_port/;  # map SID➜port in LUA or header
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

Each Wetty container binds an ephemeral high port; your proxy (or the script) rewrites `/terminal/<sid>` to the correct container port.

---

## 6 . Auto-cleanup

Add a `systemd` timer or cron job:

```bash
# /usr/local/bin/expire_sessions.sh
for sid in $(devpod list --json | jq -r '.[] | select(.status=="Running") | .name'); do
  AGE=$(devpod info "$sid" --json | jq -r '.createdAt' | \
        xargs -I{} date -d {} +%s)
  if [ $(( $(date +%s) - AGE )) -gt 3600 ]; then   # >1 h
    devpod stop "$sid" && docker rm -f "wetty_${sid}" || true
  fi
done
```

---

## 7 . Trying it out

1. **Run the script** from the middle server (`sudo ./wetty_launch.sh`).
2. Hand the generated URL to anyone with HTTPS access.
3. After a short wait they land directly in the VM’s shell—no IDE, no agent installs.

---

## 8 . Swapping the backend later

| Backend                | How to switch                                                          | Boot speed | Caveats                                                                               |
| ---------------------- | ---------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------- |
| **Ignite**             | `ignite run --name $SID --ssh ubuntu:22.04` → parse `ignite ps` for IP | \~0.5 s    | Project archived—community-only support ([ignite.readthedocs.io][5], [github.com][6]) |
| **Firecracker native** | Build rootfs & kernel, then `curl -XPUT` to FC’s REST API              | \~0.1 s    | Steep learning curve; must wire tap device & cloud-init yourself ([github.com][7])    |

*The Wetty half stays identical—only step 2 changes.*

---

## 9 . Security & polish checklist

| Item      | Quick win                                                                                                             |
| --------- | --------------------------------------------------------------------------------------------------------------------- |
| **TLS**   | Terminate at Nginx (`certbot --nginx`).                                                                               |
| **Login** | Add `--basic-auth user:hash` to Wetty or front-gate `/sessions` API behind your existing SSO ([supertechcrew.com][8]) |
| **Audit** | Replace Wetty with Teleport OSS later if you need per-command logging.                                                |
| **IAM**   | Restrict the DevPod provider key to `ec2:RunInstances`, `ec2:TerminateInstances`, `ec2:Describe*`.                    |
| **Costs** | Use Spot instances (`--ec2-instance-type t3.small --ec2-use-spot`) once stable.                                       |

---

## 10 . Hand-off note for the intern

1. **Re-read this doc, then clone the repo** (or folder) that contains `wetty_launch.sh`.
2. **Provision the middle server** (step 1) and install prerequisites (step 2).
3. **Configure AWS creds** (or an alternative provider) and run the bootstrap script.
4. **Test the URL** from your laptop—if you see a shell prompt, you’re done.
5. **Write down anything unclear** and escalate; we’ll tighten security & clean-ups once the PoC is solid.

Happy hacking!

[1]: https://devpod.sh/docs/managing-providers/add-provider?utm_source=chatgpt.com "Add a Provider | DevPod docs | DevContainers everywhere"
[2]: https://dev.to/algoorgoal/setting-your-remote-development-environment-1npd?utm_source=chatgpt.com "⚙️Setting up your remote development environment using Devpod"
[3]: https://devpod.sh/docs/troubleshooting/?utm_source=chatgpt.com "Troubleshooting | DevPod docs | DevContainers everywhere"
[4]: https://github.com/butlerx/wetty?utm_source=chatgpt.com "GitHub - butlerx/wetty: Terminal in browser over http/https. (Ajaxterm ..."
[5]: https://ignite.readthedocs.io/en/stable/usage/?utm_source=chatgpt.com "How to use Ignite to run VMs - Weave Ignite"
[6]: https://github.com/weaveworks/ignite?utm_source=chatgpt.com "GitHub - weaveworks/ignite: Ignite a Firecracker microVM"
[7]: https://github.com/firecracker-microvm/firecracker/blob/main/docs/getting-started.md?utm_source=chatgpt.com "firecracker/docs/getting-started.md at main - GitHub"
[8]: https://www.supertechcrew.com/wetty-browser-ssh-terminal/?utm_source=chatgpt.com "WeTTy the Fast SSH Terminal in Your Browser - Super Tech Crew"

