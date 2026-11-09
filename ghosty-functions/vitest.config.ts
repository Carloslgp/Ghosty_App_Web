import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.base.js';

export default mergeConfig(base, defineConfig({ test: {} }));
