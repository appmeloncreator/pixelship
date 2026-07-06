(()=>{
  const main=document.querySelector('main');
  if(main){
    for(const id of ['admin','search','notifications','profile']){
      const section=document.getElementById(id);
      if(section&&!main.contains(section))main.appendChild(section);
    }
  }

  const style=document.createElement('style');
  style.textContent=`
    #search,#profile{overflow:auto;padding:32px 16px}
    #search>.section-head,#search>.content-page,
    #profile>.section-head,#profile>.content-page{
      width:min(760px,100%);
      margin-left:auto;
      margin-right:auto;
      box-sizing:border-box;
    }
    #search>.content-page,#profile>.content-page{padding:0}
  `;
  document.head.appendChild(style);

  renderMine=function(){
    const mine=state.user?state.posts.filter(post=>post.userId===state.user.id):[];
    $('#myGrid').innerHTML=mine.length
      ?mine.map(post=>'<div class="mini" data-id="'+post.id+'"><img src="'+post.image+'" alt="'+esc(post.prompt)+'"><span class="mini-status '+(post.isPublic?'public':'')+'">'+(post.isPublic?'PUBLIC':'PRIVATE')+'</span><div class="mini-tools"><button data-action="edit">EDIT</button><button data-action="'+(post.isPublic?'private':'publish')+'">'+(post.isPublic?'MAKE PRIVATE':'PUBLISH')+'</button><button class="danger" data-action="delete">DELETE</button></div></div>').join('')+'<div class="mini empty">＋ NEW IDEA</div>'
      :'<div class="mini empty">'+(state.user?'YOUR NEXT IDEA':'SIGN IN TO CREATE')+'</div>';
    renderLibrary();
  };

  if(typeof state!=='undefined'&&state.posts)renderMine();
})();
