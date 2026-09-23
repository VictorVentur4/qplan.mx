import { Card, CardContent } from "@/components/ui/card";

const StatCard = ({ title, value, icon: Icon }) => {
  return (
    <Card className="glass border-white/10 rounded-2xl">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-[#A3A3A3]">{title}</p>
            <p className="text-3xl font-bold text-white mt-1">{value}</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#CCFF00]/10 flex items-center justify-center">
            <Icon className="w-6 h-6 text-[#CCFF00]" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default StatCard;