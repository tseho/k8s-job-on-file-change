import chokidar from "chokidar";
import fetch from "node-fetch";
import debounce from "lodash.debounce";

const env = (key: string): string => {
  const val = process.env[key];
  if (!val) {
    throw new Error(`Environment variable ${key} is missing`);
  }
  return val;
};

const WATCH_DIR = env("WATCH_DIR");
const WATCH_REGEX = env("WATCH_REGEX");
const K8S_API_SERVER = env("K8S_API_SERVER");
const K8S_TOKEN = env("K8S_TOKEN");
const K8S_NAMESPACE = env("K8S_NAMESPACE");
const K8S_CRONJOB = env("K8S_CRONJOB");
const DEBOUNCE = Number(process.env.DEBOUNCE || 5000); // ms
const CACHE = Boolean(process.env.CACHE || true);
const DEBUG = Boolean(process.env.DEBUG || false);

const cache = new Map();

const createJob = async () => {
  try {
    const responseGetCronjob = await fetch(
      `${K8S_API_SERVER}/apis/batch/v1/namespaces/${K8S_NAMESPACE}/cronjobs/${K8S_CRONJOB}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${K8S_TOKEN}`,
          Accept: "application/json",
        },
      }
    );

    if (!responseGetCronjob.ok) {
      const errText = await responseGetCronjob.text();
      throw new Error(`Failed to fetch CronJob: ${responseGetCronjob.status} ${errText}`);
    }

    const cronjob = (await responseGetCronjob.json()) as any;

    const jobSpec = {
      apiVersion: "batch/v1",
      kind: "Job",
      metadata: {
        generateName: `${K8S_CRONJOB}-manual-`,
        namespace: K8S_NAMESPACE,
      },
      spec: cronjob.spec.jobTemplate.spec,
    };

    const responseCreateJob = await fetch(
      `${K8S_API_SERVER}/apis/batch/v1/namespaces/${K8S_NAMESPACE}/jobs`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${K8S_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(jobSpec),
      }
    );

    if (!responseCreateJob.ok) {
      const errText = await responseCreateJob.text();
      throw new Error(`Failed to create Job: ${responseCreateJob.status} ${errText}`);
    }

    const job = await responseCreateJob.json() as any;
    console.log("Job created from CronJob:", job.metadata.name);
  } catch (err) {
    console.error("Error creating Job from CronJob:", err);
  }
};

const debounced = debounce(() => {
  console.log("File change detected. Creating Job...");
  createJob();
}, DEBOUNCE);

const watcher = chokidar.watch(WATCH_DIR, {
  // ignored: /(^|[\/\\])\../, // ignore dotfiles
  persistent: true,
  ignorePermissionErrors: true,
});

const onChange = (path: string) => {
  const cached = CACHE && (cache.get(path) || 0) > 0;
  if (path.match(WATCH_REGEX) && !cached) {
    cache.set(path, Date.now());
    console.log(`Change detected in: ${path}`);
    debounced();
  }
}

watcher
  .on("ready", () => DEBUG && console.log('ALL', watcher.getWatched()))
  .on("unlink", (path) => DEBUG && console.log(`UNLINK ${path}`))
  .on("addDir", (path) => DEBUG && console.log(`ADDDIR ${path}`))
  .on("unlinkDir", (path) => DEBUG && console.log(`UNLINKDIR ${path}`))
  .on("add", (path) => {
    DEBUG && console.log(`ADD ${path}`);
    onChange(path);
  })
  .on("change", (path) => {
    DEBUG && console.log(`CHANGE ${path}`);
    onChange(path);
  })
  .on("error", (error) => console.error(`Watcher error: ${error}`));

console.log(`Watching directory: ${WATCH_DIR}`);
