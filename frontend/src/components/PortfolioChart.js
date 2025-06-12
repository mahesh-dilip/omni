import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// A predefined set of colors for our chart slices
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#ff4d4d', '#4dff4d', '#4d4dff'];

const PortfolioChart = ({ data }) => {
  // We need to process the inventory data to group it by category and sum the values
  const chartData = React.useMemo(() => {
    if (!data || data.length === 0) {
      return [];
    }
    
    const categoryValues = data
      .filter(item => item.is_trackable && item.status === 'analyzed')
      .reduce((acc, item) => {
        const category = item.category || 'Other';
        const value = item.estimated_value || 0;
        if (!acc[category]) {
          acc[category] = 0;
        }
        acc[category] += value;
        return acc;
      }, {});

    return Object.entries(categoryValues).map(([name, value]) => ({ name, value }));

  }, [data]);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
        <p className="text-gray-500">Add some valuable items to see your portfolio breakdown.</p>
      </div>
    );
  }

  return (
    // ResponsiveContainer makes the chart fit its parent container
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          labelLine={false}
          outerRadius={80}
          fill="#8884d8"
          dataKey="value"
          nameKey="name"
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
};

export default PortfolioChart; 