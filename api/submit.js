/**
 * Vercel Edge Function - 接收问卷数据并写入飞书多维表格
 *
 * 环境变量（需在 Vercel Dashboard 中配置）：
 * - FEISHU_APP_ID: 飞书应用的 App ID
 * - FEISHU_APP_SECRET: 飞书应用的 App Secret
 * - FEISHU_APP_TOKEN: 多维表格的 App Token（URL 中的那串字符）
 * - FEISHU_TABLE_ID: 数据表的 Table ID
 */

export const config = {
  runtime: 'edge',
};

const FEISHU_BASE = 'https://open.feishu.cn/open-apis';

async function getTenantAccessToken(appId, appSecret) {
  const res = await fetch(`${FEISHU_BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Feishu auth error: ${data.msg || JSON.stringify(data)}`);
  }
  return data.tenant_access_token;
}

async function createRecord(token, appToken, tableId, fields) {
  // 使用新版 Base API (base/v1) 替代旧版 bitable/v1
  const res = await fetch(
    `${FEISHU_BASE}/base/v1/apps/${appToken}/tables/${tableId}/records`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ fields }),
    }
  );
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Feishu create record error: ${data.msg || JSON.stringify(data)}`);
  }
  return data.data;
}

export default async function handler(request) {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  try {
    const body = await request.json();
    const {
      FEISHU_APP_ID,
      FEISHU_APP_SECRET,
      FEISHU_APP_TOKEN,
      FEISHU_TABLE_ID,
    } = process.env;

    if (!FEISHU_APP_ID || !FEISHU_APP_SECRET || !FEISHU_APP_TOKEN || !FEISHU_TABLE_ID) {
      return new Response(
        JSON.stringify({ error: 'Missing Feishu environment variables' }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // 获取飞书 token
    const token = await getTenantAccessToken(FEISHU_APP_ID, FEISHU_APP_SECRET);

    // 构建飞书记录字段（扁平化结构，便于多维表格查看）
    const fields = {};

    // 基础信息
    fields['提交时间'] = body.timestamp || new Date().toISOString();
    fields['受访者ID'] = body.respondentId || 'anonymous';

    // Section A: 每个用户的5个维度评分 + 开放题
    if (body.sectionA && Array.isArray(body.sectionA)) {
      body.sectionA.forEach((userRating, idx) => {
        const prefix = `用户${idx + 1}`;
        fields[`${prefix}_A1_整体自然度`] = userRating.A1 || '';
        fields[`${prefix}_A2_人设匹配`] = userRating.A2 || '';
        fields[`${prefix}_A3_生活逻辑`] = userRating.A3 || '';
        fields[`${prefix}_A4_图文匹配`] = userRating.A4 || '';
        fields[`${prefix}_A5_帖子连贯`] = userRating.A5 || '';
        fields[`${prefix}_开放题`] = userRating.comment || '';
      });
    }

    // Section B: 30张图片的判别结果
    if (body.sectionB && Array.isArray(body.sectionB)) {
      body.sectionB.forEach((imgJudge, idx) => {
        fields[`Img${String(idx + 1).padStart(2, '0')}`] = imgJudge.value || '';
      });
    }

    // 后测问卷
    if (body.postsurvey) {
      fields['Q6_小红书使用频率'] = body.postsurvey.q6 || '';
      fields['Q9_判别自信度'] = body.postsurvey.q9 || '';
    }

    // 写入飞书
    const record = await createRecord(token, FEISHU_APP_TOKEN, FEISHU_TABLE_ID, fields);

    return new Response(
      JSON.stringify({ success: true, recordId: record.record_id }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (err) {
    console.error('Submit error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}
