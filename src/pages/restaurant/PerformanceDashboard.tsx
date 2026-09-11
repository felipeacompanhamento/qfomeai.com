import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * PerformanceDashboard redirects to the unified executive Dashboard (/restaurant/dashboard).
 * Eliminates duplicate views and centralizes all executive restaurant indicators.
 */
export default function PerformanceDashboard() {
  return <Navigate to="/restaurant/dashboard" replace />;
}
