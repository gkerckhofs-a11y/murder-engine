export default function NarrativeText({
  text,
  className=''
}:{
  text?:string|null;
  className?:string;
}){
  const value=String(text??'').trim();

  if(!value)return null;

  const paragraphs=value.split(/\n\s*\n/g);

  return <div className={`narrativeText ${className}`.trim()}>
    {paragraphs.map((paragraph,index)=><p key={index}>
      {paragraph.split(/(\*\*[^*]+\*\*)/g).map((part,partIndex)=>
        part.startsWith('**')&&part.endsWith('**')
          ? <strong key={partIndex}>{part.slice(2,-2)}</strong>
          : part
      )}
    </p>)}
  </div>;
}
