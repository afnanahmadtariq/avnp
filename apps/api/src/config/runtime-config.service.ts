import { Injectable } from "@nestjs/common";
import {
  loadRuntimeConfig,
  type RelayRuntimeConfig,
} from "@relay/runtime-config";

@Injectable()
export class RuntimeConfigService {
  readonly value: RelayRuntimeConfig;

  constructor() {
    this.value = loadRuntimeConfig();
  }
}
