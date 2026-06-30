/**
 * Health Monitoring Service
 * Monitors the health of AI providers and caches their status
 * Automatically skips unhealthy providers during execution
 */
class HealthMonitorService {
  constructor() {
    this.healthCache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes cache TTL
    this.checkInterval = 5 * 60 * 1000; // Check every 5 minutes (increased frequency for better reliability)
    this.checkTimer = null;
  }

  /**
   * Start automatic health checks
   */
  startMonitoring(aiOrchestrator) {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
    }

    this.aiOrchestrator = aiOrchestrator;
    this.checkAllProviders();

    this.checkTimer = setInterval(() => {
      this.checkAllProviders();
    }, this.checkInterval);

    console.log('[HealthMonitor] Started monitoring providers');
  }

  /**
   * Stop automatic health checks
   */
  stopMonitoring() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
      console.log('[HealthMonitor] Stopped monitoring providers');
    }
  }

  /**
   * Check health of all providers
   */
  async checkAllProviders() {
    if (!this.aiOrchestrator) {
      console.warn('[HealthMonitor] AI Orchestrator not initialized');
      return;
    }

    const providers = this.aiOrchestrator.providers;
    const healthResults = {};

    for (const [name, provider] of providers) {
      try {
        const isHealthy = await provider.healthCheck();
        this.setHealthStatus(name, isHealthy);
        healthResults[name] = isHealthy;
        console.log(`[HealthMonitor] ${name}: ${isHealthy ? 'HEALTHY' : 'UNHEALTHY'}`);
      } catch (error) {
        this.setHealthStatus(name, false);
        healthResults[name] = false;
        console.error(`[HealthMonitor] ${name} health check failed:`, error.message);
      }
    }

    return healthResults;
  }

  /**
   * Check health of a specific provider
   */
  async checkProvider(providerName) {
    if (!this.aiOrchestrator) {
      console.warn('[HealthMonitor] AI Orchestrator not initialized');
      return false;
    }

    const provider = this.aiOrchestrator.providers.get(providerName);
    if (!provider) {
      console.warn(`[HealthMonitor] Provider ${providerName} not found`);
      return false;
    }

    try {
      const isHealthy = await provider.healthCheck();
      this.setHealthStatus(providerName, isHealthy);
      return isHealthy;
    } catch (error) {
      this.setHealthStatus(providerName, false);
      console.error(`[HealthMonitor] ${providerName} health check failed:`, error.message);
      return false;
    }
  }

  /**
   * Set health status for a provider
   */
  setHealthStatus(providerName, isHealthy) {
    this.healthCache.set(providerName, {
      healthy: isHealthy,
      timestamp: Date.now()
    });
  }

  /**
   * Get health status for a provider
   */
  getHealthStatus(providerName) {
    const cached = this.healthCache.get(providerName);
    
    if (!cached) {
      return null; // No cached status
    }

    // Check if cache is expired
    if (Date.now() - cached.timestamp > this.cacheTTL) {
      this.healthCache.delete(providerName);
      return null; // Cache expired
    }

    return cached.healthy;
  }

  /**
   * Check if provider is healthy (uses cache)
   */
  isProviderHealthy(providerName) {
    const isHealthy = this.getHealthStatus(providerName);
    return isHealthy === null ? true : isHealthy; // Default to healthy if no cache
  }

  /**
   * Get all healthy providers
   */
  getHealthyProviders(providerNames) {
    return providerNames.filter(name => this.isProviderHealthy(name));
  }

  /**
   * Get all unhealthy providers
   */
  getUnhealthyProviders(providerNames) {
    return providerNames.filter(name => !this.isProviderHealthy(name));
  }

  /**
   * Get health statistics
   */
  getHealthStats() {
    const stats = {
      total: 0,
      healthy: 0,
      unhealthy: 0,
      unknown: 0,
      providers: {}
    };

    for (const [name, cached] of this.healthCache) {
      stats.total++;
      if (cached.healthy) {
        stats.healthy++;
      } else {
        stats.unhealthy++;
      }
      stats.providers[name] = {
        healthy: cached.healthy,
        timestamp: cached.timestamp,
        age: Date.now() - cached.timestamp
      };
    }

    return stats;
  }

  /**
   * Clear health cache
   */
  clearCache() {
    this.healthCache.clear();
    console.log('[HealthMonitor] Health cache cleared');
  }

  /**
   * Force refresh all provider health
   */
  async forceRefresh() {
    console.log('[HealthMonitor] Force refreshing all providers');
    return await this.checkAllProviders();
  }
}

// Singleton instance
const healthMonitor = new HealthMonitorService();

module.exports = healthMonitor;
module.exports.HealthMonitorServiceClass = HealthMonitorService;
