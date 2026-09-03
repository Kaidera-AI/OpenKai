# SOP: Forking and Cherry-Picking from Upstream (OMP/Pi)

**Status:** BINDING. Prevents the `origin/main` OMP-branding leak.

## The rule

OpenKai is a **product**, not a fork-branch. The GitHub repo must show OpenKai
branding, not upstream (omp/pi) branding. One credit line is allowed; everything
else is ours.

## Correct process

### 1. Fork the upstream repo separately

```bash
# Create a SEPARATE fork repo for tracking upstream
git clone https://github.com/can1357/oh-my-pi.git omp-upstream
cd omp-upstream
git remote add upstream https://github.com/can1357/oh-my-pi.git
git push -u origin omp-upstream
```

This repo exists ONLY to track upstream changes. It never becomes the
product repo.

### 2. Create the product repo from scratch

```bash
# Create the product repo — NOT a fork, a NEW repo
gh repo create Kaidera-AI/OpenKai --public
cd OpenKai
git init
git remote add origin https://github.com/Kaidera-AI/OpenKai.git
```

The product repo starts empty. It has no upstream history.

### 3. Cherry-pick features from upstream

```bash
# From the omp-upstream clone, identify commits to bring in
cd omp-upstream
git log --oneline upstream/main -20

# Cherry-pick into OpenKai
cd ../OpenKai
git cherry-pick <commit-sha>
# Resolve conflicts, rebrand as needed
git commit -m "port: <feature> from omp v18.x.x"
```

### 4. Rebrand everything

Every cherry-picked feature must be rebranded:

| Upstream name | OpenKai name |
|---|---|
| `omp` / `oh-my-pi` | `openkai` / `OpenKai` |
| `pi-*` packages | `@kaidera/openkai-*` |
| `~/.omp/` config | `~/.openkai/` |
| `omp.sh` | `openkai.dev` (or none) |
| `can1357/oh-my-pi` links | `Kaidera-AI/OpenKai` links |
| `pi-tui` | `openkai-tui` (or keep as dependency) |
| `pi-ai` | `openkai-ai` (or keep as dependency) |

### 5. Credit line

One line in the README, in the footer:

```markdown
Built on [Pi](https://github.com/badlogic/pi-mono) and [omp](https://github.com/can1357/oh-my-pi) (MIT).
```

No other upstream branding. No upstream links in the nav. No upstream badges.
No upstream CI workflows.

### 6. What NOT to do

- **NEVER** push the upstream `main` branch to the product repo's `main`.
  The product repo's `main` must only contain OpenKai content.
- **NEVER** merge the upstream `main` branch into the product repo. Use
  `git cherry-pick` for individual features only.
- **NEVER** keep upstream CI workflows, badges, or links in the product repo.
- **NEVER** keep upstream branding in package names, file paths, or config.
- **NEVER** merge a full upstream release as-is. Port features individually.

## Why this happened

The `Kaidera-AI/OpenKai` repo was created from the omp fork and the upstream
`main` branch was pushed directly. The result: GitHub showed omp branding
(omp.sh, hero.png, can1357 links) on the product page. The product's own
branding (OpenKai hexagon, Kaidera colours) was buried on a side branch.

## Prevention checklist

- [ ] `origin/main` shows OpenKai README, not omp README
- [ ] No `can1357` or `oh-my-pi` links in the repo
- [ ] No `.omp/` directory in the repo
- [ ] No upstream CI workflows
- [ ] Package names are `@kaidera/openkai-*`
- [ ] Config path is `~/.openkai/`
- [ ] One credit line for Pi/omp, nothing else
