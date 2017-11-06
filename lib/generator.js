'use strict'

const nunjucks = require('nunjucks')
const pathFn = require('path')
const fs = require('fs')
const xmlescape = require('xml-escape')
const S = require('string')

const env = new nunjucks.Environment()
env.addFilter('uriencode', str => encodeURI(str))
env.addFilter('strip_html', str => (!str || str === "") ? "" : S(str).stripTags().s)
env.addFilter('xml_escape', str => (!str || str === "") ? "" : xmlescape(str))
env.addFilter('date_to_rfc822', str => (new Date(str)).toUTCString())

const rss2TmplSrc = pathFn.join(__dirname, '../rss2.xml')
const rss2Tmpl = nunjucks.compile(fs.readFileSync(rss2TmplSrc, 'utf8'), env)

const getFeedConfig = (feed, config) => {
  let cfg = Object.assign({
    type: 'rss2',
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
  
  cfg.self_url = config.url + config.root + cfg.path
  cfg.itunes.author = cfg.itunes.author || config.author
  cfg.itunes.subtitle = cfg.itunes.subtitle || config.title
  cfg.itunes.summary = cfg.itunes.summary || `A podcast from ${config.title}`
  
  return cfg
}

module.exports = function (locals) {
  let config = this.config
  let template = rss2Tmpl

  let output = []

  for (let feeds of config.podcasts) {
    const feedConfig = getFeedConfig(feeds.feed, config)
    const url = config.url + config.root + (feedConfig.non_feed_url || '')

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
      return {
        title: post.title,
        date: post.date,
        permalink: post.permalink,
        content,
        content_encoded,
        subtitle: content ? content.substr(0, 250) : null,
        author: post.author || config.author,
        image: post.image || feedConfig.image,
        media: feedConfig.media_base_url + post.media,
        length: post.length,
        media_type: post.media_type || feedConfig.default_media_type,
        duration: post.duration,
        chapters: post.chapters
      }
    })

    output.push({
      path: feedConfig.path,
      data: template.render({
        config,
        feedConfig,
        url,
        hexo_version: hexo.env.version,
        as_of: (episodes[0] || { date: Date() }).date,
        episodes
      })
    })
  }
  return output
}
