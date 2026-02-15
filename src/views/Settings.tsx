'use client';

import { Bell, Database, Shield, Users } from 'lucide-react';

export default function Settings() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Settings</h1>
        <p className="text-slate-600">Configure your platform preferences and integrations</p>
      </div>

      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Bell className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Notifications</h2>
              <p className="text-sm text-slate-600">Manage alert preferences</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <div>
                <div className="font-medium text-slate-900">Email Alerts</div>
                <div className="text-sm text-slate-600">Receive policy violation notifications via email</div>
              </div>
              <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-emerald-600">
                <span className="inline-block h-4 w-4 transform rounded-full bg-white translate-x-6" />
              </button>
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <div>
                <div className="font-medium text-slate-900">Slack Integration</div>
                <div className="text-sm text-slate-600">Send alerts to your Slack workspace</div>
              </div>
              <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-slate-300">
                <span className="inline-block h-4 w-4 transform rounded-full bg-white translate-x-1" />
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
              <Database className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Cluster Connection</h2>
              <p className="text-sm text-slate-600">Manage Kubernetes cluster integrations</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">API Endpoint</label>
              <input
                type="text"
                value="https://api.cluster.example.com"
                readOnly
                className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-600"
              />
            </div>
            <div className="flex items-center gap-3">
              <button className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                Test Connection
              </button>
              <button className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200">
                Update Config
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Security</h2>
              <p className="text-sm text-slate-600">Configure security and access controls</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <div>
                <div className="font-medium text-slate-900">Enforce Mode</div>
                <div className="text-sm text-slate-600">Block non-compliant deployments (vs audit-only)</div>
              </div>
              <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-emerald-600">
                <span className="inline-block h-4 w-4 transform rounded-full bg-white translate-x-6" />
              </button>
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <div>
                <div className="font-medium text-slate-900">Two-Factor Authentication</div>
                <div className="text-sm text-slate-600">Require 2FA for platform access</div>
              </div>
              <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-slate-300">
                <span className="inline-block h-4 w-4 transform rounded-full bg-white translate-x-1" />
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Team Members</h2>
              <p className="text-sm text-slate-600">Manage user access and permissions</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center">
                  <span className="font-medium text-slate-700">A</span>
                </div>
                <div>
                  <div className="font-medium text-slate-900">Admin User</div>
                  <div className="text-sm text-slate-600">admin@sme.com</div>
                </div>
              </div>
              <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
                Owner
              </span>
            </div>
            <button className="w-full py-3 border-2 border-dashed border-slate-300 rounded-lg text-slate-600 hover:border-emerald-500 hover:text-emerald-600 transition-colors">
              + Add Team Member
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
