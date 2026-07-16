const ASSET_PAGE_SIZE_KEY = 'cyberstrike.asset_page_size';
function getAssetPageSize() {
    try {
        const value = Number(localStorage.getItem(ASSET_PAGE_SIZE_KEY));
        return [10, 20, 50, 100].includes(value) ? value : 20;
    } catch (error) {
        return 20;
    }
}
const assetPageState = { page: 1, pageSize: getAssetPageSize(), total: 0, totalPages: 1, items: [], projects: [], projectsLoaded: false, detailIndex: -1, editIndex: -1, detailAsset: null, editAsset: null, selected: new Map(), scanMode: 'chat', scanAssets: [], editorTags: [], editorDirty: false, editorBusy: false, editorReturnFocus: null, editorInteractionsReady: false, editorParsedTarget: '' };
let assetOverviewDays = 30;

const ASSET_CUSTOM_SELECT_IDS = [
    'asset-status-filter',
    'asset-project-filter',
    'asset-batch-project',
    'asset-edit-project',
    'asset-edit-status',
    'asset-page-size-pagination'
];

function enhanceAssetSelect(select) {
    if (!select || typeof enhanceSettingsSelect !== 'function') return;
    enhanceSettingsSelect(select);
    const wrapper = select.closest('.settings-custom-select');
    if (!wrapper) return;
    wrapper.classList.add('asset-custom-select');
    wrapper.classList.toggle('asset-custom-select--filter', select.id === 'asset-status-filter' || select.id === 'asset-project-filter');
    wrapper.classList.toggle('asset-custom-select--pagination', select.id === 'asset-page-size-pagination');
}

function initAssetCustomSelects(root) {
    const scope = root || document;
    ASSET_CUSTOM_SELECT_IDS.forEach(id => {
        const select = scope.getElementById ? scope.getElementById(id) : scope.querySelector(`#${id}`);
        if (select) enhanceAssetSelect(select);
    });
}

function syncAssetSelect(selectOrId) {
    const select = typeof selectOrId === 'string' ? document.getElementById(selectOrId) : selectOrId;
    if (!select) return;
    enhanceAssetSelect(select);
    if (typeof syncSettingsCustomSelect === 'function') syncSettingsCustomSelect(select);
}

function assetT(key, fallback, options) {
    if (window.i18next && typeof window.i18next.t === 'function') {
        const value = window.i18next.t(key, options || {});
        if (value && value !== key) return value;
    }
    return fallback;
}

async function loadAssetOverview() {
    try {
        const response = await apiFetch('/api/assets/stats?days=' + assetOverviewDays);
        if (!response.ok) throw new Error(await response.text());
        const stats = await response.json();
        ['total', 'ips', 'domains', 'ports', 'recent'].forEach(key => {
            const el = document.getElementById('asset-stat-' + key);
            if (el) el.textContent = Number(stats[key] || 0).toLocaleString();
        });
        renderAssetRecentSummary(Number(stats.recent || 0), Number(stats.total || 0));
        renderAssetTrendCharts(stats.asset_trend || [], stats.risk_trend || []);
        renderAssetCoverage(stats.coverage || {}, Number(stats.total || 0));
        renderAssetProtocolChart(stats.protocols || [], Number(stats.total || 0));
    } catch (error) {
        console.error('加载资产概览失败:', error);
        if (typeof showInlineToast === 'function') showInlineToast(assetT('assets.loadFailed', '加载资产失败') + ': ' + error.message);
    }
}

function setAssetOverviewPeriod(days) {
    const normalized = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
    if (normalized === assetOverviewDays) return;
    assetOverviewDays = normalized;
    document.querySelectorAll('.asset-period-switch button').forEach(button => {
        const active = Number(button.dataset.days) === normalized;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    loadAssetOverview();
}

function renderAssetRecentSummary(recent, total) {
    const percent = total ? Math.min(100, Math.round(recent / total * 100)) : 0;
    const bar = document.getElementById('asset-recent-progress');
    const caption = document.getElementById('asset-recent-rate');
    if (bar) bar.style.width = percent + '%';
    if (caption) caption.textContent = assetT('assets.recentShare', `占当前资产总量的 ${percent}%`, { percent });
}

function renderAssetTrendCharts(assetTrend, riskTrend) {
    renderAssetLineChart('asset-growth-chart', 'asset-growth-summary', assetTrend, [
        { key: 'added', label: assetT('assets.addedAssets', '新增资产'), color: '#3b82f6', fill: 'rgba(59,130,246,.13)' },
        { key: 'inactive', label: assetT('assets.inactiveAssets', '停用资产'), color: '#8b5cf6' }
    ]);
    renderAssetLineChart('asset-risk-chart', 'asset-risk-summary', riskTrend, [
        { key: 'discovered', label: assetT('assets.discoveredRisks', '新增漏洞'), color: '#f59e0b', fill: 'rgba(245,158,11,.12)' },
        { key: 'high_risk', label: assetT('assets.highRisks', '高危及严重'), color: '#ef4444' }
    ]);
}

function renderAssetLineChart(rootId, summaryId, points, series) {
    const root = document.getElementById(rootId);
    if (!root) return;
    const data = Array.isArray(points) ? points : [];
    const totals = series.map(item => data.reduce((sum, point) => sum + Number(point[item.key] || 0), 0));
    const summaryRoot = document.getElementById(summaryId);
    const summaryContent = series.map((item, index) => `<div><span>${escapeHtml(item.label)}</span><strong style="color:${item.color}">${totals[index].toLocaleString()}</strong></div>`).join('');
    if (summaryRoot) summaryRoot.innerHTML = summaryContent;
    if (!data.length) {
        root.innerHTML = '<div class="muted">' + escapeHtml(assetT('common.noData', '暂无数据')) + '</div>';
        return;
    }
    const width = 680, height = 220, left = 34, right = 12, top = 18, bottom = 28;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const maxValue = Math.max(1, ...data.flatMap(point => series.map(item => Number(point[item.key] || 0))));
    const x = index => left + (data.length === 1 ? plotWidth / 2 : index / (data.length - 1) * plotWidth);
    const y = value => top + plotHeight - (Number(value || 0) / maxValue * plotHeight);
    const grid = [0, .25, .5, .75, 1].map(ratio => {
        const gy = top + plotHeight * ratio;
        const label = Math.round(maxValue * (1 - ratio));
        return `<line x1="${left}" y1="${gy}" x2="${width - right}" y2="${gy}"/><text x="${left - 8}" y="${gy + 4}" text-anchor="end">${label}</text>`;
    }).join('');
    const paths = series.map(item => {
        const coords = data.map((point, index) => `${x(index).toFixed(1)},${y(point[item.key]).toFixed(1)}`);
        const line = `<polyline points="${coords.join(' ')}" fill="none" stroke="${item.color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
        if (!item.fill || !coords.length) return line;
        const area = `M ${x(0).toFixed(1)} ${top + plotHeight} L ${coords.join(' L ')} L ${x(data.length - 1).toFixed(1)} ${top + plotHeight} Z`;
        return `<path d="${area}" fill="${item.fill}"/>${line}`;
    }).join('');
    const labelIndexes = [...new Set([0, Math.floor((data.length - 1) / 2), data.length - 1])];
    const labels = labelIndexes.map(index => `<text x="${x(index)}" y="${height - 7}" text-anchor="${index === 0 ? 'start' : index === data.length - 1 ? 'end' : 'middle'}">${escapeHtml(String(data[index].date || '').slice(5))}</text>`).join('');
    const aria = series.map((item, index) => `${item.label} ${totals[index]}`).join('，');
    root.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(aria)}" preserveAspectRatio="none"><g class="asset-chart-grid">${grid}${labels}</g>${paths}</svg>`;
}

function renderAssetCoverage(coverage, total) {
    const rate = Math.max(0, Math.min(100, Number(coverage.rate || 0)));
    const recentRate = Math.max(0, Math.min(100, Number(coverage.recent_rate || 0)));
    const values = {
        scanned: Number(coverage.scanned || 0),
        recent: Number(coverage.scanned_30d || 0),
        never: Number(coverage.never_scanned || 0),
        stale: Number(coverage.stale || 0)
    };
    const gauge = document.getElementById('asset-coverage-gauge');
    if (gauge) gauge.style.setProperty('--asset-coverage-value', rate + '%');
    const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    setText('asset-coverage-rate', rate + '%');
    setText('asset-coverage-scanned', values.scanned.toLocaleString());
    setText('asset-coverage-recent', values.recent.toLocaleString());
    setText('asset-coverage-recent-rate', assetT('assets.coverageOfTotal', `占全部资产 ${recentRate}%`, { percent: recentRate }));
    setText('asset-coverage-never', values.never.toLocaleString());
    setText('asset-coverage-stale', values.stale.toLocaleString());
    setText('asset-coverage-status', total ? assetT('assets.coverageMeta', `${values.scanned} / ${total} 已覆盖`, { scanned: values.scanned, total }) : '—');
}

function renderAssetProtocolChart(items, total) {
    const root = document.getElementById('asset-protocol-chart');
    const summary = document.getElementById('asset-protocol-summary');
    const meta = document.getElementById('asset-protocol-meta');
    const topList = document.getElementById('asset-protocol-top-list');
    if (!root) return;
    if (!items.length) {
        root.innerHTML = '<div class="muted">' + escapeHtml(assetT('common.noData', '暂无数据')) + '</div>';
        if (summary) summary.hidden = true;
        if (topList) topList.innerHTML = '';
        if (meta) meta.textContent = assetT('assets.protocolKinds', '0 种协议', { count: 0 });
        return;
    }
    if (summary) summary.hidden = false;
    if (meta) meta.textContent = assetT('assets.protocolKinds', `${items.length} 种协议`, { count: items.length });
    const max = Math.max(...items.map(item => Number(item.count || 0)), 1);
    const protocolTotal = items.reduce((sum, item) => sum + Number(item.count || 0), 0);
    const leading = items.reduce((best, item) => Number(item.count || 0) > Number(best.count || 0) ? item : best, items[0]);
    const leadingCount = Number(leading.count || 0);
    const leadingPercent = (total || protocolTotal) ? Math.round(leadingCount / (total || protocolTotal) * 100) : 0;
    const colors = ['#4f7df3', '#6d5df6', '#13b8a6', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#94a3b8'];
    if (summary) {
        const donut = summary.querySelector('.asset-protocol-donut');
        const percentNode = donut?.querySelector('strong');
        const leadName = summary.querySelector('.asset-protocol-lead strong');
        const leadCount = summary.querySelector('.asset-protocol-lead small');
        if (donut) {
            const denominator = Math.max(total || protocolTotal, 1);
            let cursor = 0;
            const stops = items.map((item, index) => {
                const start = cursor;
                cursor = Math.min(100, cursor + Number(item.count || 0) / denominator * 100);
                return `${colors[index % colors.length]} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
            });
            if (cursor < 100) stops.push(`var(--border-color,#e5e7eb) ${cursor.toFixed(2)}% 100%`);
            donut.style.background = `conic-gradient(from -90deg,${stops.join(',')})`;
        }
        if (percentNode) percentNode.textContent = leadingPercent + '%';
        if (leadName) leadName.textContent = leading.name || 'unknown';
        if (leadCount) leadCount.textContent = assetT('assets.assetCountUnit', `${leadingCount} 个资产`, { count: leadingCount });
    }
    if (topList) {
        topList.innerHTML = items.slice(0, 3).map((item, index) => {
            const count = Number(item.count || 0);
            const percent = total ? count / total * 100 : 0;
            const displayPercent = percent > 0 && percent < 1 ? '<1%' : Math.round(percent) + '%';
            return `<div><i style="background:${colors[index]}"></i><span>${escapeHtml(item.name || 'unknown')}</span><strong>${escapeHtml(displayPercent)}</strong></div>`;
        }).join('');
    }
    root.innerHTML = items.map((item, index) => {
        const count = Number(item.count || 0);
        const width = Math.max(3, Math.round(count / max * 100));
        const percent = total ? count / total * 100 : 0;
        const displayPercent = percent > 0 && percent < 1 ? '&lt;1%' : Math.round(percent) + '%';
        const color = colors[index % colors.length];
        return `<div class="asset-bar-row" style="--protocol-color:${color}"><span class="asset-bar-rank">${String(index + 1).padStart(2, '0')}</span><span class="asset-bar-label">${escapeHtml(item.name || 'unknown')}</span><div class="asset-bar-track"><i style="width:${width}%"></i></div><strong>${count}</strong><small>${displayPercent}</small></div>`;
    }).join('');
}

async function loadAssets(page) {
    // 无显式页码表示进入资产库或点击顶部“刷新”，此时同步项目筛选项。
    // 翻页、搜索等带页码的操作继续复用缓存，避免重复请求项目列表。
    await ensureAssetProjects(page == null);
    assetPageState.page = Number(page || assetPageState.page || 1);
    const params = new URLSearchParams({ page: assetPageState.page, page_size: assetPageState.pageSize });
    const q = document.getElementById('asset-search')?.value.trim() || '';
    const status = document.getElementById('asset-status-filter')?.value || '';
    const projectId = document.getElementById('asset-project-filter')?.value || '';
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    if (projectId) params.set('project_id', projectId);
    const body = document.getElementById('asset-table-body');
    if (body) body.innerHTML = '<tr><td colspan="9" class="muted">' + escapeHtml(assetT('common.loading', '加载中...')) + '</td></tr>';
    try {
        const response = await apiFetch('/api/assets?' + params.toString());
        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();
        assetPageState.items = data.assets || [];
        assetPageState.total = data.total || 0;
        assetPageState.totalPages = data.total_pages || 1;
        assetPageState.page = data.page || 1;
        if (assetPageState.page > assetPageState.totalPages) {
            return loadAssets(assetPageState.totalPages);
        }
        renderAssetRows();
        updateAssetSelectionUI();
        renderAssetPagination();
        const meta = document.getElementById('asset-list-meta');
        if (meta) meta.textContent = assetT('assets.totalMeta', `共 ${data.total || 0} 条`, { count: data.total || 0 });
    } catch (error) {
        console.error('加载资产失败:', error);
        assetPageState.items = [];
        assetPageState.total = 0;
        assetPageState.totalPages = 1;
        if (body) body.innerHTML = '<tr><td colspan="9" class="muted">' + escapeHtml(assetT('assets.loadFailed', '加载资产失败')) + '</td></tr>';
        renderAssetPagination();
    }
}

function assetTargetLabel(asset) {
    return asset.host || asset.domain || asset.ip || '-';
}

function assetRiskPresentation(level) {
    const normalized = ['critical', 'high', 'medium', 'low', 'info', 'normal'].includes(level) ? level : 'unassessed';
    const labels = {
        critical: assetT('assets.riskCritical', '严重'),
        high: assetT('assets.riskHigh', '高危'),
        medium: assetT('assets.riskMedium', '中危'),
        low: assetT('assets.riskLow', '低危'),
        info: assetT('assets.riskInfo', '提示'),
        normal: assetT('assets.riskNormal', '正常'),
        unassessed: assetT('assets.riskUnassessed', '未评估')
    };
    return { level: normalized, label: labels[normalized] };
}

function renderAssetRows() {
    const body = document.getElementById('asset-table-body');
    if (!body) return;
    if (!assetPageState.items.length) {
        body.innerHTML = '<tr><td colspan="9" class="muted">' + escapeHtml(assetT('common.noData', '暂无数据')) + '</td></tr>';
        return;
    }
    body.innerHTML = assetPageState.items.map((asset, index) => {
        const service = [asset.protocol, asset.port ? ':' + asset.port : ''].join('') || '-';
        const targetHint = [asset.host, asset.ip, asset.domain].filter(Boolean).filter((value, i, values) => values.indexOf(value) === i).join(' · ');
        const lastScan = asset.last_scan_at ? new Date(asset.last_scan_at).toLocaleString() : '-';
        const vulnerabilityCount = Number(asset.vulnerability_count || 0);
        const risk = assetRiskPresentation(asset.risk_level);
        const statusLabel = asset.status === 'inactive' ? assetT('assets.statusInactive', '停用') : assetT('assets.statusActive', '活跃');
        return `<tr>
            <td class="asset-check-cell"><input type="checkbox" ${assetPageState.selected.has(asset.id) ? 'checked' : ''} onchange="toggleAssetSelection(${index},this.checked)" aria-label="${escapeHtml(assetT('assets.selectAsset', '选择资产'))}"></td>
            <td><button class="asset-target-link" title="${escapeHtml(targetHint)}" onclick="openAssetDetail(${index})">${escapeHtml(assetTargetLabel(asset))}</button></td>
            <td><span class="asset-service" title="${escapeHtml(service)}">${escapeHtml(service)}</span></td>
            <td>${asset.project_name ? `<span class="asset-project-badge">${escapeHtml(asset.project_name)}</span>` : '<span class="muted">-</span>'}</td>
            <td>${escapeHtml(lastScan)}</td><td>${vulnerabilityCount > 0 ? `<button class="asset-vulnerability-link" onclick="openAssetVulnerabilities(${index})">${vulnerabilityCount}</button>` : '<span class="muted">0</span>'}</td>
            <td><span class="asset-risk asset-risk--${risk.level}">${escapeHtml(risk.label)}</span></td>
            <td><span class="asset-status asset-status--${escapeHtml(asset.status || 'active')}">${escapeHtml(statusLabel)}</span></td>
            <td class="asset-row-actions"><button class="btn-link" onclick="openAssetScanModal('chat',${index})">${escapeHtml(assetT('assets.sendToChatShort', '扫描'))}</button><button class="btn-link" data-require-permission="asset:write" onclick="openAssetEditor(${index})">${escapeHtml(assetT('common.edit', '编辑'))}</button><button class="btn-link asset-delete" data-require-permission="asset:delete" onclick="deleteAsset(${index})">${escapeHtml(assetT('common.delete', '删除'))}</button></td>
        </tr>`;
    }).join('');
    if (typeof applyRBACToUI === 'function') applyRBACToUI(body);
}

function toggleAssetSelection(index, checked) {
    const asset = assetPageState.items[Number(index)];
    if (!asset) return;
    if (checked) assetPageState.selected.set(asset.id, asset);
    else assetPageState.selected.delete(asset.id);
    updateAssetSelectionUI();
}

function toggleAssetPageSelection(checked) {
    assetPageState.items.forEach(asset => {
        if (checked) assetPageState.selected.set(asset.id, asset);
        else assetPageState.selected.delete(asset.id);
    });
    renderAssetRows();
    updateAssetSelectionUI();
}

function clearAssetSelection() {
    assetPageState.selected.clear();
    renderAssetRows();
    updateAssetSelectionUI();
}

function updateAssetSelectionUI() {
    const count = assetPageState.selected.size;
    const actions = document.getElementById('asset-batch-actions');
    const label = document.getElementById('asset-selected-count');
    if (actions) actions.hidden = count === 0;
    if (label) label.textContent = assetT('assets.selectedCount', `已选择 ${count} 项`, { count });
    const pageToggle = document.getElementById('asset-select-page');
    if (pageToggle) {
        const selectedOnPage = assetPageState.items.filter(asset => assetPageState.selected.has(asset.id)).length;
        pageToggle.checked = assetPageState.items.length > 0 && selectedOnPage === assetPageState.items.length;
        pageToggle.indeterminate = selectedOnPage > 0 && selectedOnPage < assetPageState.items.length;
    }
}

async function openAssetProjectModal() {
    const assets = Array.from(assetPageState.selected.values());
    if (!assets.length) {
        alert(assetT('assets.selectAssetsFirst', '请先选择资产'));
        return;
    }
    await ensureAssetProjects(true);
    populateAssetProjectSelects();
    const select = document.getElementById('asset-batch-project');
    const projectIds = Array.from(new Set(assets.map(asset => asset.project_id || '')));
    if (select) {
        select.value = projectIds.length === 1 && projectIds[0] ? projectIds[0] : '';
        if (typeof syncSettingsCustomSelect === 'function') syncSettingsCustomSelect(select);
    }
    const subtitle = document.getElementById('asset-project-subtitle');
    if (subtitle) subtitle.textContent = assetT('assets.bindProjectCount', `将更新 ${assets.length} 个资产`, { count: assets.length });
    if (typeof openAppModal === 'function') openAppModal('asset-project-modal');
    else document.getElementById('asset-project-modal').style.display = 'flex';
    if (select) select.focus();
}

function closeAssetProjectModal() {
    if (typeof closeAppModal === 'function') closeAppModal('asset-project-modal');
    else document.getElementById('asset-project-modal').style.display = 'none';
}

async function submitAssetProjectBinding() {
    const ids = Array.from(assetPageState.selected.keys());
    if (!ids.length) return;
    const selectedProject = document.getElementById('asset-batch-project')?.value || '';
    if (!selectedProject) {
        alert(assetT('assets.selectProjectRequired', '请选择要绑定的项目'));
        return;
    }
    const projectId = selectedProject;
    const button = document.getElementById('asset-project-submit');
    if (button) button.disabled = true;
    try {
        const response = await apiFetch('/api/assets/project-binding', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ asset_ids: ids, project_id: projectId })
        });
        if (!response.ok) throw new Error(await assetEditorResponseError(response));
        closeAssetProjectModal();
        clearAssetSelection();
        await loadAssets(assetPageState.page);
        if (typeof showInlineToast === 'function') {
            showInlineToast(assetT('assets.bindProjectDone', `已绑定 ${ids.length} 个资产`, { count: ids.length }));
        }
    } catch (error) {
        alert(assetT('assets.bindProjectFailed', '绑定项目失败') + ': ' + error.message);
    } finally {
        if (button) button.disabled = false;
    }
}

function assetScanPromptDefault() {
    const placeholders = { asset_id: '{{asset_id}}', target: '{{target}}', host: '{{host}}', ip: '{{ip}}', domain: '{{domain}}', port: '{{port}}' };
    return assetT('assets.defaultScanPrompt', '请对资产 {{target}}（资产ID：{{asset_id}}）进行授权安全扫描，优先检查暴露服务、已知漏洞、弱口令和常见 Web 风险；通过 record_vulnerability 保存确认的漏洞，完成后调用 complete_asset_scan(id={{asset_id}}) 回写上次扫描时间和相关漏洞。', placeholders);
}

function openAssetScanModal(mode, index) {
    const one = Number.isInteger(index) ? assetPageState.items[index] : null;
    const assets = one ? [one] : Array.from(assetPageState.selected.values());
    if (!assets.length) {
        alert(assetT('assets.selectAssetsFirst', '请先选择资产'));
        return;
    }
    assetPageState.scanMode = mode === 'task' ? 'task' : 'chat';
    assetPageState.scanAssets = assets;
    const taskMode = assetPageState.scanMode === 'task';
    document.getElementById('asset-scan-title').textContent = taskMode ? assetT('assets.createScanTask', '创建扫描任务') : assetT('assets.sendToChat', '发送到对话');
    document.getElementById('asset-scan-subtitle').textContent = assetT('assets.scanAssetCount', `${assets.length} 个资产`, { count: assets.length });
    document.getElementById('asset-scan-targets').innerHTML = assets.slice(0, 12).map(asset => `<span class="asset-scan-target-chip">${escapeHtml(assetTargetLabel(asset))}</span>`).join('') + (assets.length > 12 ? `<span class="muted">+${assets.length - 12}</span>` : '');
    document.getElementById('asset-scan-prompt').value = assetScanPromptDefault();
    document.getElementById('asset-scan-hint').textContent = assetT('assets.promptHint', '可使用 {{asset_id}}、{{target}}、{{host}}、{{ip}}、{{domain}}、{{port}} 占位符；创建任务时会为每个资产生成一条任务。', { asset_id: '{{asset_id}}', target: '{{target}}', host: '{{host}}', ip: '{{ip}}', domain: '{{domain}}', port: '{{port}}' });
    const executeWrap = document.getElementById('asset-scan-execute-wrap');
    executeWrap.hidden = !taskMode;
    document.getElementById('asset-scan-submit').textContent = taskMode ? assetT('assets.confirmCreate', '创建任务') : assetT('assets.confirmSend', '确认发送');
    if (typeof openAppModal === 'function') openAppModal('asset-scan-modal');
    else document.getElementById('asset-scan-modal').style.display = 'flex';
}

function closeAssetScanModal() {
    if (typeof closeAppModal === 'function') closeAppModal('asset-scan-modal');
    else document.getElementById('asset-scan-modal').style.display = 'none';
}

function renderAssetScanPrompt(template, asset) {
    const values = {
        asset_id: asset.id || '', target: assetTargetLabel(asset), host: asset.host || '', ip: asset.ip || '', domain: asset.domain || '', port: asset.port || ''
    };
    return Object.keys(values).reduce((text, key) => text.replaceAll(`{{${key}}}`, String(values[key])), template);
}

function commonAssetProjectId(assets) {
    const ids = Array.from(new Set(assets.map(asset => asset.project_id || '')));
    return ids.length === 1 ? ids[0] : '';
}

async function recordAssetScanLinks(scans) {
    const response = await apiFetch('/api/assets/scan-links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scans }) });
    if (!response.ok) throw new Error(await response.text());
}

async function submitAssetScan() {
    const assets = assetPageState.scanAssets.slice();
    const template = document.getElementById('asset-scan-prompt').value.trim();
    if (!assets.length || !template) {
        alert(assetT('assets.promptRequired', '请输入用户提示词'));
        return;
    }
    const button = document.getElementById('asset-scan-submit');
    button.disabled = true;
    try {
        if (assetPageState.scanMode === 'task') {
            await createAssetScanTasks(assets, template);
        } else {
            await sendAssetsToChat(assets, template);
        }
        closeAssetScanModal();
        clearAssetSelection();
        await loadAssets(assetPageState.page);
    } catch (error) {
        console.error('提交资产扫描失败:', error);
        alert(assetT('assets.scanSubmitFailed', '提交扫描失败') + ': ' + error.message);
    } finally {
        button.disabled = false;
    }
}

async function sendAssetsToChat(assets, template) {
    const targets = assets.map(assetTargetLabel).join(', ');
    const message = assets.map(asset => renderAssetScanPrompt(template, asset)).join('\n\n---\n\n');
    const response = await apiFetch('/api/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: assetT('assets.scanConversationTitle', `资产扫描：${targets}`, { targets }), projectId: commonAssetProjectId(assets) }) });
    if (!response.ok) throw new Error(await response.text());
    const conversation = await response.json();
    await recordAssetScanLinks(assets.map(asset => ({ asset_id: asset.id, conversation_id: conversation.id })));
    switchPage('chat');
    await loadConversation(conversation.id);
    const input = document.getElementById('chat-input');
    input.value = message;
    if (typeof adjustTextareaHeight === 'function') adjustTextareaHeight(input);
    // 消息流可能持续很久；启动发送即可返回，让提交弹窗立即关闭。
    void sendMessage();
}

async function createAssetScanTasks(assets, template) {
    const tasks = assets.map(asset => renderAssetScanPrompt(template, asset));
    const executeNow = !!document.getElementById('asset-scan-execute-now').checked;
    const response = await apiFetch('/api/batch-tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: assetT('assets.scanQueueTitle', '资产批量扫描'), tasks, executeNow, projectId: commonAssetProjectId(assets), concurrency: 1, agentMode: 'eino_single', scheduleMode: 'manual' }) });
    if (!response.ok) throw new Error(await response.text());
    const result = await response.json();
    const queueTasks = result.queue && Array.isArray(result.queue.tasks) ? result.queue.tasks : [];
    if (queueTasks.length !== assets.length) throw new Error(assetT('assets.scanTaskLinkFailed', '任务已创建，但资产关联失败'));
    await recordAssetScanLinks(assets.map((asset, index) => ({ asset_id: asset.id, queue_id: result.queueId, task_id: queueTasks[index].id })));
    switchPage('tasks');
    if (typeof showBatchQueueDetail === 'function') showBatchQueueDetail(result.queueId);
}

function openAssetVulnerabilities(index) {
    const asset = assetPageState.items[Number(index)];
    if (!asset) return;
    if (asset.last_scan_task_id) {
        window.location.hash = `vulnerabilities?task_id=${encodeURIComponent(asset.last_scan_task_id)}`;
        return;
    }
    window.location.hash = asset.last_scan_conversation_id
        ? `vulnerabilities?conversation_id=${encodeURIComponent(asset.last_scan_conversation_id)}`
        : 'vulnerabilities';
}

function renderAssetPagination() {
    const root = document.getElementById('asset-pagination');
    if (!root) return;
    const page = assetPageState.page;
    const totalPages = assetPageState.totalPages || 1;
    const total = assetPageState.total || 0;
    const pageSize = assetPageState.pageSize;
    const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const end = total === 0 ? 0 : Math.min(page * pageSize, total);
    const atFirst = page <= 1 || total === 0;
    const atLast = page >= totalPages || total === 0;
    root.innerHTML = `<div class="pagination">
        <div class="pagination-info">
            <span>${escapeHtml(assetT('skillsPage.paginationShow', `显示 ${start}-${end} / 共 ${total} 条`, { start, end, total }))}</span>
            <label class="pagination-page-size">${escapeHtml(assetT('skillsPage.perPageLabel', '每页显示'))}
                <select id="asset-page-size-pagination" onchange="changeAssetPageSize()">
                    ${[10, 20, 50, 100].map(size => `<option value="${size}" ${size === pageSize ? 'selected' : ''}>${size}</option>`).join('')}
                </select>
            </label>
        </div>
        <div class="pagination-controls">
            <button class="btn-secondary" onclick="loadAssets(1)" ${atFirst ? 'disabled' : ''}>${escapeHtml(assetT('skillsPage.firstPage', '首页'))}</button>
            <button class="btn-secondary" onclick="loadAssets(${Math.max(1, page - 1)})" ${atFirst ? 'disabled' : ''}>${escapeHtml(assetT('skillsPage.prevPage', '上一页'))}</button>
            <span class="pagination-page">${escapeHtml(assetT('skillsPage.pageOf', `第 ${page} / ${totalPages} 页`, { current: page, total: totalPages }))}</span>
            <button class="btn-secondary" onclick="loadAssets(${Math.min(totalPages, page + 1)})" ${atLast ? 'disabled' : ''}>${escapeHtml(assetT('skillsPage.nextPage', '下一页'))}</button>
            <button class="btn-secondary" onclick="loadAssets(${totalPages})" ${atLast ? 'disabled' : ''}>${escapeHtml(assetT('skillsPage.lastPage', '尾页'))}</button>
        </div>
    </div>`;
    syncAssetSelect('asset-page-size-pagination');
}

function changeAssetPageSize() {
    const select = document.getElementById('asset-page-size-pagination');
    const size = Number(select?.value);
    if (![10, 20, 50, 100].includes(size)) return;
    assetPageState.pageSize = size;
    try { localStorage.setItem(ASSET_PAGE_SIZE_KEY, String(size)); } catch (error) { /* ignore */ }
    loadAssets(1);
}

async function ensureAssetProjects(force) {
    if (assetPageState.projectsLoaded && !force) return;
    try {
        const response = await apiFetch('/api/projects?limit=500');
        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();
        assetPageState.projects = data.projects || [];
        assetPageState.projectsLoaded = true;
        populateAssetProjectSelects();
    } catch (error) {
        console.warn('加载资产项目选项失败:', error);
        assetPageState.projectsLoaded = true;
    }
}

function populateAssetProjectSelects() {
    const configs = [
        ['asset-project-filter', assetT('assets.allProjects', '全部项目')],
        ['asset-edit-project', assetT('assets.unboundProject', '暂不绑定')]
    ];
    configs.forEach(([id, emptyLabel]) => {
        const el = document.getElementById(id);
        if (!el) return;
        const current = el.value;
        el.innerHTML = `<option value="">${escapeHtml(emptyLabel)}</option>` + assetPageState.projects.map(project => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)}${project.status === 'archived' ? ' · ' + escapeHtml(assetT('assets.archived', '已归档')) : ''}</option>`).join('');
        el.value = current;
        syncAssetSelect(el);
    });
    const batch = document.getElementById('asset-batch-project');
    if (batch) {
        const current = batch.value;
        batch.innerHTML = `<option value="" disabled hidden>${escapeHtml(assetT('assets.chooseProject', '请选择项目'))}</option>` + assetPageState.projects.map(project => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)}${project.status === 'archived' ? ' · ' + escapeHtml(assetT('assets.archived', '已归档')) : ''}</option>`).join('');
        batch.value = current;
        syncAssetSelect(batch);
    }
}

async function openAssetEditor(indexOrAsset) {
    // 项目可能在资产页首次加载后被新增、编辑或归档，打开编辑器时重新拉取，
    // 避免下拉框长期复用 projectsLoaded 缓存而只能通过整页刷新更新。
    await ensureAssetProjects(true);
    const isIndex = Number.isInteger(indexOrAsset);
    const asset = isIndex ? assetPageState.items[indexOrAsset] : (indexOrAsset && typeof indexOrAsset === 'object' ? indexOrAsset : null);
    assetPageState.editIndex = isIndex && asset ? indexOrAsset : -1;
    assetPageState.editAsset = asset;
    assetPageState.editorReturnFocus = document.activeElement;
    document.getElementById('asset-edit-id').value = asset?.id || '';
    document.getElementById('asset-edit-host').value = asset?.host || '';
    document.getElementById('asset-edit-ip').value = asset?.ip || '';
    document.getElementById('asset-edit-domain').value = asset?.domain || '';
    document.getElementById('asset-edit-port').value = asset?.port || '';
    document.getElementById('asset-edit-protocol').value = asset?.protocol || '';
    document.getElementById('asset-edit-server').value = asset?.server || '';
    document.getElementById('asset-edit-project').value = asset?.project_id || '';
    document.getElementById('asset-edit-country').value = asset?.country || '';
    document.getElementById('asset-edit-province').value = asset?.province || '';
    document.getElementById('asset-edit-city').value = asset?.city || '';
    document.getElementById('asset-edit-title-value').value = asset?.title || '';
    document.getElementById('asset-edit-tags').value = '';
    assetPageState.editorTags = Array.from(new Set((asset?.tags || []).map(value => String(value).trim()).filter(Boolean)));
    renderAssetEditorTags();
    document.getElementById('asset-edit-status').value = asset?.status || 'active';
    syncAssetSelect('asset-edit-project');
    syncAssetSelect('asset-edit-status');
    document.getElementById('asset-edit-target').value = assetEditorTargetFromAsset(asset);
    assetPageState.editorParsedTarget = document.getElementById('asset-edit-target').value.trim();
    clearAssetEditorErrors();
    document.getElementById('asset-editor-title').textContent = asset ? assetT('assets.editAssetTitle', '编辑资产') : assetT('assets.addAssetTitle', '新增资产');
    const submit = document.getElementById('asset-editor-submit');
    submit.textContent = asset ? assetT('common.save', '保存') : assetT('assets.addAssetAction', '添加资产');
    ensureAssetEditorInteractions();
    assetPageState.editorDirty = false;
    assetPageState.editorBusy = false;
    setAssetEditorBusy(false);
    if (typeof openAppModal === 'function') openAppModal('asset-editor-modal', { focusEl: document.getElementById('asset-edit-target') });
    else document.getElementById('asset-editor-modal').style.display = 'flex';
}

function closeAssetEditor(force) {
    if (!force && assetPageState.editorDirty && !confirm(assetT('assets.discardChanges', '放弃尚未保存的更改吗？'))) return;
    if (typeof closeAppModal === 'function') closeAppModal('asset-editor-modal');
    else document.getElementById('asset-editor-modal').style.display = 'none';
    const returnFocus = assetPageState.editorReturnFocus;
    assetPageState.editorDirty = false;
    if (returnFocus && typeof returnFocus.focus === 'function') requestAnimationFrame(() => returnFocus.focus());
}

function assetEditorTargetFromAsset(asset) {
    if (!asset) return '';
    if (asset.host) return String(asset.host);
    const target = asset.domain || asset.ip || '';
    if (!target) return '';
    const wrapped = String(target).includes(':') && !String(target).startsWith('[') ? `[${target}]` : target;
    return `${wrapped}${Number(asset.port || 0) > 0 ? ':' + Number(asset.port) : ''}`;
}

function assetEditorDefaultPort(protocol) {
    return ({ http: 80, https: 443, ssh: 22, ftp: 21, smtp: 25, rdp: 3389, mysql: 3306, postgresql: 5432, redis: 6379, mongodb: 27017 })[protocol] || 0;
}

function assetEditorProtocolForPort(port) {
    return ({ 80: 'http', 443: 'https', 22: 'ssh', 21: 'ftp', 25: 'smtp', 3389: 'rdp', 3306: 'mysql', 5432: 'postgresql', 6379: 'redis', 27017: 'mongodb' })[port] || '';
}

function assetEditorIsIPv4(value) {
    const parts = String(value).split('.');
    return parts.length === 4 && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

function assetEditorIsIPv6(value) {
    const candidate = String(value).replace(/^\[|\]$/g, '');
    if (!candidate.includes(':') || !/^[0-9a-f:.]+$/i.test(candidate)) return false;
    try { return new URL(`http://[${candidate}]/`).hostname.length > 2; } catch (error) { return false; }
}

function assetEditorNormalizeDomain(value) {
    const raw = String(value || '').trim().replace(/\.$/, '');
    if (!raw || raw.length > 253 || raw.includes('_') || /[\/?#@]/.test(raw)) return '';
    try {
        const hostname = new URL(`http://${raw}/`).hostname.toLowerCase().replace(/\.$/, '');
        if (!hostname || hostname.length > 253 || hostname.split('.').some(label => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))) return '';
        return hostname;
    } catch (error) { return ''; }
}

function parseAssetEditorTarget(value) {
    const raw = String(value || '').trim();
    if (!raw) throw new Error(assetT('assets.targetRequired', '请输入资产地址'));
    const opaqueTarget = () => ({ host: raw, ip: '', domain: '', port: 0, protocol: '' });
    let hostname = '';
    let port = 0;
    let protocol = '';
    let host = '';
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
        let parsed;
        try { parsed = new URL(raw); } catch (error) { return opaqueTarget(); }
        if (!parsed.hostname || parsed.username || parsed.password) return opaqueTarget();
        protocol = parsed.protocol.replace(':', '').toLowerCase();
        hostname = parsed.hostname.replace(/^\[|\]$/g, '');
        port = parsed.port ? Number(parsed.port) : assetEditorDefaultPort(protocol);
        host = raw;
    } else {
        let authority = raw.replace(/\/$/, '');
        const bracketed = authority.match(/^\[([^\]]+)](?::(\d+))?$/);
        if (bracketed) {
            hostname = bracketed[1];
            port = Number(bracketed[2] || 0);
        } else if ((authority.match(/:/g) || []).length === 1 && /:\d+$/.test(authority)) {
            const splitAt = authority.lastIndexOf(':');
            hostname = authority.slice(0, splitAt);
            port = Number(authority.slice(splitAt + 1));
        } else {
            hostname = authority;
        }
        protocol = assetEditorProtocolForPort(port);
    }
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(assetT('assets.portInvalid', '端口必须在 1–65535 之间'));
    const isIP = assetEditorIsIPv4(hostname) || assetEditorIsIPv6(hostname);
    const domain = isIP ? '' : assetEditorNormalizeDomain(hostname);
    if (!isIP && (!domain || assetEditorIsIPv4(domain) || assetEditorIsIPv6(domain))) return opaqueTarget();
    return { host, ip: isIP ? hostname.toLowerCase() : '', domain, port, protocol };
}

function applyAssetEditorTarget(showError) {
    const input = document.getElementById('asset-edit-target');
    try {
        const parsed = parseAssetEditorTarget(input.value);
        document.getElementById('asset-edit-host').value = parsed.host;
        document.getElementById('asset-edit-ip').value = parsed.ip;
        document.getElementById('asset-edit-domain').value = parsed.domain;
        document.getElementById('asset-edit-port').value = parsed.port || '';
        document.getElementById('asset-edit-protocol').value = parsed.protocol;
        assetPageState.editorParsedTarget = input.value.trim();
        setAssetEditorFieldError('asset-edit-target', '');
        return parsed;
    } catch (error) {
        if (showError) setAssetEditorFieldError('asset-edit-target', error.message);
        return null;
    }
}

function setAssetEditorFieldError(inputId, message) {
    const input = document.getElementById(inputId);
    const error = document.getElementById(inputId + '-error');
    if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (error) { error.textContent = message || ''; error.hidden = !message; }
}

function setAssetEditorFormError(message) {
    const error = document.getElementById('asset-editor-form-error');
    if (!error) return;
    error.textContent = message || '';
    error.hidden = !message;
}

function clearAssetEditorErrors() {
    ['asset-edit-target', 'asset-edit-host', 'asset-edit-ip', 'asset-edit-domain', 'asset-edit-port', 'asset-edit-protocol'].forEach(id => setAssetEditorFieldError(id, ''));
    setAssetEditorFormError('');
}

function addAssetEditorTags(raw) {
    String(raw || '').split(/[,，]/).map(value => value.trim()).filter(Boolean).forEach(tag => {
        if (!assetPageState.editorTags.includes(tag) && assetPageState.editorTags.length < 30) assetPageState.editorTags.push(tag);
    });
    document.getElementById('asset-edit-tags').value = '';
    assetPageState.editorDirty = true;
    renderAssetEditorTags();
}

function removeAssetEditorTag(index) {
    assetPageState.editorTags.splice(Number(index), 1);
    assetPageState.editorDirty = true;
    renderAssetEditorTags();
}

function renderAssetEditorTags() {
    const root = document.getElementById('asset-tag-chips');
    if (!root) return;
    root.replaceChildren(...assetPageState.editorTags.map((tag, index) => {
        const chip = document.createElement('span');
        chip.className = 'asset-tag-chip';
        const text = document.createElement('span');
        text.textContent = tag;
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = '×';
        button.setAttribute('aria-label', assetT('assets.removeTag', `移除标签 ${tag}`, { tag }));
        button.onclick = () => removeAssetEditorTag(index);
        chip.append(text, button);
        return chip;
    }));
}

function ensureAssetEditorInteractions() {
    if (assetPageState.editorInteractionsReady) return;
    assetPageState.editorInteractionsReady = true;
    const form = document.getElementById('asset-editor-form');
    const target = document.getElementById('asset-edit-target');
    const tagInput = document.getElementById('asset-edit-tags');
    form.addEventListener('input', event => {
        if (event.target !== tagInput) assetPageState.editorDirty = true;
        if (event.target === target) setAssetEditorFieldError('asset-edit-target', '');
        setAssetEditorFormError('');
    });
    target.addEventListener('blur', () => { if (target.value.trim()) applyAssetEditorTarget(true); });
    tagInput.addEventListener('keydown', event => {
        if ((event.key === 'Enter' || event.key === ',') && tagInput.value.trim()) { event.preventDefault(); addAssetEditorTags(tagInput.value); }
        else if (event.key === 'Backspace' && !tagInput.value && assetPageState.editorTags.length) removeAssetEditorTag(assetPageState.editorTags.length - 1);
    });
    tagInput.addEventListener('blur', () => { if (tagInput.value.trim()) addAssetEditorTags(tagInput.value); });
    document.addEventListener('keydown', event => {
        if (typeof isAppModalOpen !== 'function' || !isAppModalOpen('asset-editor-modal')) return;
        if (event.key === 'Escape') { event.preventDefault(); closeAssetEditor(); return; }
        if (event.key !== 'Tab') return;
        const focusable = Array.from(form.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')).filter(el => !el.hidden && el.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
}

function collectAssetEditor() {
    const existing = assetPageState.editAsset || {};
    return {
        host: document.getElementById('asset-edit-host').value.trim(), ip: document.getElementById('asset-edit-ip').value.trim(),
        domain: document.getElementById('asset-edit-domain').value.trim(), port: Number(document.getElementById('asset-edit-port').value || 0),
        protocol: document.getElementById('asset-edit-protocol').value.trim(), server: document.getElementById('asset-edit-server').value.trim(),
        title: document.getElementById('asset-edit-title-value').value.trim(), status: document.getElementById('asset-edit-status').value,
        source: existing.source || 'manual', source_query: existing.source_query || '',
        country: document.getElementById('asset-edit-country').value.trim(), province: document.getElementById('asset-edit-province').value.trim(), city: document.getElementById('asset-edit-city').value.trim(),
        project_id: document.getElementById('asset-edit-project').value,
        tags: assetPageState.editorTags.slice()
    };
}

function validateAssetEditor() {
    clearAssetEditorErrors();
    const target = document.getElementById('asset-edit-target').value.trim();
    let parsed = null;
    if (target !== assetPageState.editorParsedTarget) parsed = applyAssetEditorTarget(true);
    else {
        try { parsed = parseAssetEditorTarget(target); }
        catch (error) { setAssetEditorFieldError('asset-edit-target', error.message); }
    }
    if (!parsed) { document.getElementById('asset-edit-target').focus(); return false; }
    const failAdvanced = (id, message) => {
        setAssetEditorFieldError(id, message);
        requestAnimationFrame(() => document.getElementById(id).focus());
        return false;
    };
    const ip = document.getElementById('asset-edit-ip').value.trim();
    if (ip && !assetEditorIsIPv4(ip) && !assetEditorIsIPv6(ip)) return failAdvanced('asset-edit-ip', assetT('assets.ipInvalid', 'IP 地址格式无效'));
    const domainInput = document.getElementById('asset-edit-domain');
    const domain = domainInput.value.trim();
    if (domain) {
        const normalizedDomain = assetEditorNormalizeDomain(domain);
        if (!normalizedDomain) return failAdvanced('asset-edit-domain', assetT('assets.domainInvalid', '域名格式无效'));
        domainInput.value = normalizedDomain;
    }
    const portInput = document.getElementById('asset-edit-port');
    if (portInput.value !== '' && (!/^\d+$/.test(portInput.value) || Number(portInput.value) < 1 || Number(portInput.value) > 65535)) {
        return failAdvanced('asset-edit-port', assetT('assets.portInvalid', '端口必须在 1–65535 之间'));
    }
    const protocol = document.getElementById('asset-edit-protocol').value.trim().toLowerCase();
    if (protocol && !/^[a-z][a-z0-9+.-]{0,31}$/.test(protocol)) return failAdvanced('asset-edit-protocol', assetT('assets.protocolInvalid', '协议格式无效'));
    document.getElementById('asset-edit-protocol').value = protocol;
    return true;
}

function setAssetEditorBusy(busy) {
    assetPageState.editorBusy = Boolean(busy);
    const submit = document.getElementById('asset-editor-submit');
    if (!submit) return;
    submit.disabled = Boolean(busy);
    submit.classList.toggle('asset-editor-submit-busy', Boolean(busy));
}

async function assetEditorResponseError(response) {
    const text = await response.text();
    try { return JSON.parse(text).error || text; } catch (error) { return text; }
}

async function saveAsset() {
    if (assetPageState.editorBusy || !validateAssetEditor()) return;
    const pendingTag = document.getElementById('asset-edit-tags').value.trim();
    if (pendingTag) addAssetEditorTags(pendingTag);
    const id = document.getElementById('asset-edit-id').value;
    const asset = collectAssetEditor();
    setAssetEditorBusy(true);
    try {
        const response = id
            ? await apiFetch('/api/assets/' + encodeURIComponent(id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(asset) })
            : await apiFetch('/api/assets/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assets: [asset], source: 'manual' }) });
        if (!response.ok) throw new Error(await assetEditorResponseError(response));
        const result = await response.json();
        if (!id && Number(result.skipped || 0) > 0 && Number(result.created || 0) === 0 && Number(result.updated || 0) === 0) {
            throw new Error(assetT('assets.assetSkipped', '资产未保存，可能已存在且你没有更新权限'));
        }
        closeAssetEditor(true);
        await loadAssets(id ? assetPageState.page : 1);
        const projectAssetsPanel = document.getElementById('project-panel-assets');
        if (projectAssetsPanel && !projectAssetsPanel.hidden && typeof window.loadProjectAssets === 'function') await window.loadProjectAssets();
        const message = id
            ? assetT('assets.updatedSuccessfully', '资产已更新')
            : Number(result.updated || 0) > 0
                ? assetT('assets.duplicateMerged', '资产已存在，信息已安全合并')
                : assetT('assets.createdSuccessfully', '资产已添加');
        if (typeof showInlineToast === 'function') showInlineToast(message);
    } catch (error) {
        setAssetEditorFormError(assetT('assets.saveFailed', '保存资产失败') + ': ' + error.message);
    } finally {
        setAssetEditorBusy(false);
    }
}

async function deleteAsset(index) {
    const asset = assetPageState.items[index];
    if (!asset || !confirm(assetT('assets.deleteConfirm', '确定删除该资产吗？'))) return;
    const response = await apiFetch('/api/assets/' + encodeURIComponent(asset.id), { method: 'DELETE' });
    if (!response.ok) {
        alert(assetT('assets.deleteFailed', '删除资产失败'));
        return;
    }
    await loadAssets(assetPageState.page);
}

function fofaResultToAsset(row, fields) {
    const value = name => {
        if (row && !Array.isArray(row) && typeof row === 'object') {
            return row[name] != null ? String(row[name]).trim() : '';
        }
        const idx = Array.isArray(fields) ? fields.indexOf(name) : -1;
        return idx >= 0 && Array.isArray(row) && row[idx] != null ? String(row[idx]).trim() : '';
    };
    const port = Number.parseInt(value('port'), 10);
    const rawIP = value('ip');
    const ip = assetEditorIsIPv4(rawIP) || assetEditorIsIPv6(rawIP) ? rawIP.toLowerCase() : '';
    const rawDomain = value('domain');
    const domain = rawDomain && !assetEditorIsIPv4(rawDomain) && !assetEditorIsIPv6(rawDomain)
        ? assetEditorNormalizeDomain(rawDomain)
        : '';
    const rawProtocol = value('protocol').toLowerCase();
    return {
        host: value('host'), ip, port: Number.isFinite(port) ? port : 0, domain,
        protocol: /^[a-z][a-z0-9+.-]{0,31}$/.test(rawProtocol) ? rawProtocol : '', title: value('title'), server: value('server'), country: value('country'),
        province: value('province'), city: value('city'), source: 'fofa', status: 'active'
    };
}

async function importFofaAssetsByIndexes(indexes) {
    const payload = window.infoCollectState || infoCollectState;
    const current = payload && payload.currentPayload;
    if (!current || !current.results || !indexes.length) {
        alert(assetT('assets.selectFirst', '请先选择需要入库的结果'));
        return;
    }
    const converted = indexes.map(index => fofaResultToAsset(current.results[index], current.fields));
    const assets = converted.filter(asset => asset.host || asset.ip || asset.domain);
    const invalidCount = converted.length - assets.length;
    if (!assets.length) {
        alert(assetT('assets.noValidImportTarget', '所选结果中没有可入库的有效资产目标'));
        return;
    }
    const response = await apiFetch('/api/assets/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assets, source: 'fofa', source_query: current.query || '' }) });
    if (!response.ok) {
        alert(assetT('assets.importFailed', '资产入库失败') + ': ' + await response.text());
        return;
    }
    const result = await response.json();
    if (typeof showInlineToast === 'function') {
        const message = invalidCount > 0
            ? assetT('assets.importDoneWithInvalid', `已新增 ${result.created} 条，更新 ${result.updated} 条，跳过 ${invalidCount} 条无有效目标的结果`, { ...result, invalid: invalidCount })
            : assetT('assets.importDone', `已新增 ${result.created} 条，更新 ${result.updated} 条`, result);
        showInlineToast(message);
    }
}

function importSelectedFofaAssets() {
    const indexes = Array.from(infoCollectState.selectedRowIndexes || []).sort((a, b) => a - b);
    return importFofaAssetsByIndexes(indexes);
}

function importFofaRowAsset(index) {
    return importFofaAssetsByIndexes([Number(index)]);
}

function assetDetailItem(label, value, wide) {
    return `<div class="asset-detail-item${wide ? ' asset-detail-item--wide' : ''}"><span>${escapeHtml(label)}</span><div>${value || '<span class="muted">-</span>'}</div></div>`;
}

function openAssetDetail(index) {
    const asset = assetPageState.items[Number(index)];
    assetPageState.detailIndex = Number(index);
    openAssetDetailRecord(asset);
}

function openAssetDetailRecord(asset) {
    if (!asset) return;
    assetPageState.detailAsset = asset;
    const subtitle = document.getElementById('asset-detail-subtitle');
    if (subtitle) subtitle.textContent = assetTargetLabel(asset);
    const tags = (asset.tags || []).map(tag => `<span class="asset-tag">${escapeHtml(tag)}</span>`).join('');
    const values = [
        assetDetailItem(assetT('assets.project', '所属项目'), escapeHtml(asset.project_name || '')),
        assetDetailItem(assetT('assets.status', '状态'), escapeHtml(asset.status === 'inactive' ? assetT('assets.statusInactive', '停用') : assetT('assets.statusActive', '活跃'))),
        assetDetailItem('Host', escapeHtml(asset.host || '')),
        assetDetailItem('IP', escapeHtml(asset.ip || '')),
        assetDetailItem(assetT('assets.domain', '域名'), escapeHtml(asset.domain || '')),
        assetDetailItem(assetT('assets.service', '服务'), escapeHtml([asset.protocol, asset.port ? ':' + asset.port : ''].join(''))),
        assetDetailItem(assetT('assets.title', '标题/指纹'), escapeHtml(asset.title || ''), true),
        assetDetailItem(assetT('assets.server', '服务指纹'), escapeHtml(asset.server || '')),
        assetDetailItem(assetT('assets.location', '地区'), escapeHtml([asset.country, asset.province, asset.city].filter(Boolean).join(' / '))),
        assetDetailItem(assetT('assets.source', '来源'), escapeHtml(asset.source || '')),
        assetDetailItem(assetT('assets.sourceQuery', '来源查询'), asset.source_query ? `<code>${escapeHtml(asset.source_query)}</code>` : ''),
        assetDetailItem(assetT('assets.tagsLabel', '标签'), tags, true),
        assetDetailItem(assetT('assets.firstSeen', '首次发现'), escapeHtml(asset.first_seen_at ? new Date(asset.first_seen_at).toLocaleString() : '')),
        assetDetailItem(assetT('assets.lastSeen', '最近发现'), escapeHtml(asset.last_seen_at ? new Date(asset.last_seen_at).toLocaleString() : '')),
        assetDetailItem(assetT('assets.lastScan', '上次扫描'), escapeHtml(asset.last_scan_at ? new Date(asset.last_scan_at).toLocaleString() : '')),
        assetDetailItem(assetT('assets.relatedVulnerabilities', '相关漏洞'), String(Number(asset.vulnerability_count || 0)))
    ];
    const grid = document.getElementById('asset-detail-grid');
    if (grid) grid.innerHTML = values.join('');
    if (typeof applyRBACToUI === 'function') applyRBACToUI(document.getElementById('asset-detail-modal'));
    if (typeof openAppModal === 'function') openAppModal('asset-detail-modal');
    else document.getElementById('asset-detail-modal').style.display = 'flex';
}

function closeAssetDetail() {
    if (typeof closeAppModal === 'function') closeAppModal('asset-detail-modal');
    else document.getElementById('asset-detail-modal').style.display = 'none';
}

function editAssetFromDetail() {
    const asset = assetPageState.detailAsset;
    closeAssetDetail();
    if (asset) openAssetEditor(asset);
}

window.loadAssetOverview = loadAssetOverview;
window.loadAssets = loadAssets;
window.openAssetScanModal = openAssetScanModal;
window.closeAssetScanModal = closeAssetScanModal;
window.submitAssetScan = submitAssetScan;
window.toggleAssetSelection = toggleAssetSelection;
window.toggleAssetPageSelection = toggleAssetPageSelection;
window.clearAssetSelection = clearAssetSelection;
window.openAssetVulnerabilities = openAssetVulnerabilities;
window.changeAssetPageSize = changeAssetPageSize;
window.openAssetEditor = openAssetEditor;
window.closeAssetEditor = closeAssetEditor;
window.saveAsset = saveAsset;
window.deleteAsset = deleteAsset;
window.importSelectedFofaAssets = importSelectedFofaAssets;
window.importFofaRowAsset = importFofaRowAsset;
window.openAssetDetail = openAssetDetail;
window.openAssetDetailRecord = openAssetDetailRecord;
window.closeAssetDetail = closeAssetDetail;
window.editAssetFromDetail = editAssetFromDetail;

document.addEventListener('DOMContentLoaded', () => initAssetCustomSelects());
document.addEventListener('languagechange', () => ASSET_CUSTOM_SELECT_IDS.forEach(syncAssetSelect));
