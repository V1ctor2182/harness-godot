import Dockerode from 'dockerode';

export const docker = new Dockerode({ socketPath: '/var/run/docker.sock' });

export async function isDockerAvailable(): Promise<boolean> {
  try {
    await docker.ping();
    return true;
  } catch {
    return false;
  }
}
