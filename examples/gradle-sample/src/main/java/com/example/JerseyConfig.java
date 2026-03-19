package com.example;

import jakarta.ws.rs.ApplicationPath;
import org.glassfish.jersey.server.ResourceConfig;

/**
 * Jersey configuration class.
 * Registers JAX-RS resources and providers.
 */
@ApplicationPath("/api")
public class JerseyConfig extends ResourceConfig {
    
    public JerseyConfig() {
        // Register resource packages
        packages("com.example");
        
        // Register Jackson for JSON processing
        register(org.glassfish.jersey.jackson.JacksonFeature.class);
        
        System.out.println("✓ JerseyConfig initialized");
    }
}
