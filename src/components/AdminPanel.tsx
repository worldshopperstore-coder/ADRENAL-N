import OverviewTab from './admin/OverviewTab';
import PersonnelTab from './admin/PersonnelTab';
import AdvancesTab from './admin/AdvancesTab';
import PackagesAdminTab from './admin/PackagesAdminTab';
import PerformanceTab from './admin/PerformanceTab';
import ReportsTab from './admin/ReportsTab';
import PaxReportsTab from './admin/PaxReportsTab';
import CrossSalesAccountingTab from './admin/CrossSalesAccountingTab';
import IntegrationSettingsPanel from './IntegrationSettings';

interface AdminPanelProps {
  activeTab: string;
}

export default function AdminPanel({ activeTab }: AdminPanelProps) {
  return (
    <div className="p-2 sm:p-4">
      {activeTab === 'admin-overview'       && <OverviewTab />}
      {activeTab === 'admin-personnel'      && <PersonnelTab />}
      {activeTab === 'admin-advances'       && <AdvancesTab />}
      {activeTab === 'admin-packages'       && <PackagesAdminTab />}
      {activeTab === 'admin-performance'    && <PerformanceTab />}
      {activeTab === 'admin-reports'        && <ReportsTab />}
      {activeTab === 'admin-pax'            && <PaxReportsTab />}
      {activeTab === 'admin-crossaccounting' && <CrossSalesAccountingTab />}
      {activeTab === 'admin-integration'     && <IntegrationSettingsPanel />}
    </div>
  );
}
