# GitHub release and metrics evidence

PulseTap uses GitHub's native aggregate evidence rather than adding analytics or
telemetry to adopters' portals.

## What will be preserved

The scheduled workflow records:

- repository views and unique visitors;
- full clones and unique cloners;
- the top referring sites and popular repository pages;
- stars and forks;
- every versioned release asset and its cumulative download count.

Each snapshot keeps both the per-asset counts and a
`releasePackageDownloadTotal` that sums only named `.zip` packages. The separate
`releaseAssetDownloadTotal` includes checksum-file downloads and must not be
described as package downloads.

GitHub exposes repository traffic for only the latest 14 days. Automatic
account-wide preservation now lives in
[`ellivien-open-source-evidence`](https://github.com/ellivien/ellivien-open-source-evidence),
which discovers current and future public repositories every Sunday. This
repository's original collector remains available as a manual fallback only.
The JSON files contain aggregate counts and do not identify visitors.

## One-time setup before publication

1. Create a fine-grained personal access token in GitHub.
2. Restrict its repository access to the PulseTap repository only.
3. Grant **Administration: Read-only** and **Contents: Read-only**, with no
   write permissions. Administration read is required for GitHub's traffic
   endpoints; Contents read allows the same collector to record releases and
   their asset download counts while the repository is private.
4. In the PulseTap repository, open **Settings → Secrets and variables →
   Actions**.
5. Add the token as a repository secret named `PULSETAP_TRAFFIC_TOKEN`.
6. Open **Actions → Preserve GitHub metrics → Run workflow** once after the
   repository is public.
7. Confirm that a new JSON file appears under `metrics/snapshots/`.

The workflow's ordinary `GITHUB_TOKEN` receives only `contents: write`. It is
used to commit the aggregate snapshot. The separate read-only token is used
only because GitHub's traffic API requires repository Administration read
access.

## Creating the first measurable release

Set `package.json` to the intended version, run `npm run check`, commit the
release source and create a matching tag such as `v0.1.0`. Pushing that tag
starts the release workflow. It creates:

- `ellivien-pulsetap-v0.1.0.zip`;
- `ellivien-pulsetap-v0.1.0.zip.sha256`.

Direct people to the named ZIP on the GitHub Releases page. GitHub exposes a
cumulative `download_count` for named release assets. GitHub's automatically
generated “Source code” ZIP and TAR links do not provide the same asset count.

## Honest interpretation

- Views, visitors, clones, referrers and popular paths are rolling 14-day
  GitHub aggregates captured at a point in time.
- Release downloads count downloads of the named asset, not installations or
  active users.
- Stars and forks indicate public interest, not successful adoption.
- The release workflow performs one checkout when a version is published. The
  recurring metrics workflow deliberately uses the Contents API instead of
  checking out the repository, so it does not manufacture recurring clone
  traffic.
- Preserve the raw snapshots when preparing any funding or impact application;
  describe exactly what each metric measures.
