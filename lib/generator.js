'use strict'

const nunjucks = require('nunjucks')
const pathFn = require('path')
const fs = require('fs')

const env = new nunjucks.Environment()
env.addFilter('date_to_rfc822', str => (new Date(str)).toUTCString())

const getFeedConfig = (feed, config) => {
  let cfg = Object.assign({
    type: 'rss2',
    key: 'itunes',
    limit: 20,
    content: true,
    content_encoded: true,
    media_base_url: '/',
    language: 'en-US',
    itunes: {
      explicit: 'no'
    }
  }, feed)
  
  // Default file name to the type of feed being generated
  cfg.path = cfg.path || `${cfg.type.toLowerCase()}.xml`
  
  // Default file extension to xml
  if (!pathFn.extname(cfg.path)) cfg.path += '.xml'
  if (!pathFn.extname(cfg.template_path)) cfg.template_path += '.xml'

  cfg.self_url = config.url + config.root + cfg.path
  cfg.itunes.author = cfg.itunes.author || config.author
  cfg.itunes.subtitle = cfg.itunes.subtitle || config.title
  cfg.itunes.summary = cfg.itunes.summary || `A podcast from ${config.title}`
  
  return cfg
}

const find_media = (key, media_group) => {
  const len = media_group.length;
  var result = {};
  for(var i = 0; i < len; i++) {
    if(media_group[i].key == key) {
      result = {
        media_path: media_group[i].media_path,
        media_type: media_group[i].media_type,
        media_length: length
      }
      break;
    }
  }
  return result;
}

module.exports = function (locals) {
  let config = this.config

  let output = []

  for (let feeds of config.podcasts) {
    const feedConfig = getFeedConfig(feeds.feed, config)
    const url = config.url + config.root + (feedConfig.non_feed_url || '')
    const template = nunjucks.compile(fs.readFileSync(feedConfig.template_path, 'utf8'), env)
    
    // The posts that will make up the feed
    const podcast_posts = feedConfig.category
      ? locals.categories.findOne({ name: feedConfig.category }).posts
      : feedConfig.tag
        ? locals.tags.findOne({ name: feedConfig.tag }).posts
        : [] // TODO: Find posts that have a media item defined

    const episodes = podcast_posts.sort('date', -1).limit(feedConfig.limit).data.map(post => {
      const content = typeof feedConfig.content === 'function'
        ? feedConfig.content(post)
        : feedConfig.content ? post.content : null
      const content_encoded = typeof feedConfig.content_encoded === 'function'
        ? feedConfig.content_encoded(post)
        : feedConfig.content_encoded ? post.content : null
      
      const found = find_media(feedConfig.key, post.media);

      return {
        title: post.title,
        date: post.date,
        permalink: post.permalink,
        content,
        content_encoded,
        subtitle: post.subtitle || '',
        author: post.author || config.author,
        image: post.image || feedConfig.image,
        media: feedConfig.media_base_url + found.media_path,
        length: found.media_length,
        media_type: found.media_type || feedConfig.default_media_type,
        duration: post.duration,
        explicit: post.explicit || feedConfig.itunes.explicit,
        chapters: post.chapters
      }
    })

    output.push({
      path: feedConfig.path,
      data: template.render({
        config,
        feedConfig,
        url,
        hexo_version: this.env.version,
        as_of: (episodes[0] || { date: Date() }).date,
        episodes
      })
    })
  }
  return output
}
