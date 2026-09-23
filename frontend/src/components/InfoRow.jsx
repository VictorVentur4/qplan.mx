const InfoRow = ({ icon: Icon, label, value, isLink, href, external }) => {
  return (
    <div className="flex items-start gap-3 p-4 rounded-2xl bg-[#0A0A0A] border border-[#262626]">
      <Icon className="w-5 h-5 text-[#CCFF00] flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm text-[#A3A3A3] mb-1">{label}</p>
        {isLink ? (
          external ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:text-[#CCFF00] transition-colors"
            >
              {value}
            </a>
          ) : (
            <a
              href={href}
              className="text-white hover:text-[#CCFF00] transition-colors"
            >
              {value}
            </a>
          )
        ) : (
          <p className="text-white">{value}</p>
        )}
      </div>
    </div>
  );
};

export default InfoRow;